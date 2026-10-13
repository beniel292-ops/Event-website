import { useCallback, useState } from 'react';
import { AlertCircle, CheckCircle, Hash, Loader2, Mail, MailCheck, User } from 'lucide-react';
import { normalizeRegistration, validateRegistration, validateVitEmail } from '../lib/validation';
import { registerAttendee, resendPass } from '../lib/api';
import { isEventOver } from '../lib/event';
import Turnstile from './Turnstile';
import { turnstileEnabled } from '../lib/turnstile';

const ERROR_MESSAGES = {
  ALREADY_REGISTERED: 'This email or registration number is already registered. Use "Resend my pass" below to get your pass again.',
  REGISTRATION_CLOSED: 'Registration is currently closed.',
  CAPACITY_REACHED: 'All seats have been taken.',
  EVENT_ENDED: 'This event has already ended.',
  CAPTCHA_FAILED: 'Bot check failed. Please complete the check and try again.',
  VALIDATION: 'Please fix the highlighted fields.',
  NETWORK: 'Network error. Please check your connection and try again.',
};
const messageFor = (code) => ERROR_MESSAGES[code] || 'Something went wrong. Please try again in a minute.';

function Field({ id, label, icon: Icon, error, className = '', ...inputProps }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-widest text-gray-300 mb-2">
        {label}
      </label>
      <div className="relative">
        <Icon className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" aria-hidden="true" />
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`w-full bg-[#171717] border pl-10 pr-4 py-3 text-sm text-white placeholder-gray-400 rounded-xl transition-colors duration-200 focus:outline-none focus:border-white/60 focus:ring-2 focus:ring-white/20 disabled:opacity-60 ${
            error ? 'border-red-500/60' : 'border-white/10 hover:border-white/25'
          } ${className}`}
          {...inputProps}
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-400 mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ResendPass() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');
  const [token, setToken] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const onToken = useCallback((t) => setToken(t), []);

  const submit = async (e) => {
    e.preventDefault();
    const emailErr = validateVitEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    setState('sending');
    setError('');
    const result = await resendPass({ email: email.trim().toLowerCase(), turnstileToken: token });
    setResetKey((k) => k + 1);
    if (result.ok) {
      setState('sent');
    } else {
      setState('error');
      setError(result.fields?.email || messageFor(result.error));
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-gray-300 underline underline-offset-4 hover:text-white cursor-pointer"
      >
        Already registered? Resend my pass
      </button>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 text-left">
      <Field
        id="resend-email"
        label="Your registered VIT email"
        icon={Mail}
        type="email"
        autoComplete="email"
        placeholder="e.g. snake.b2025@vitstudent.ac.in"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setError('');
          setState('idle');
        }}
        error={error}
        disabled={state === 'sending'}
      />
      <Turnstile onToken={onToken} resetKey={resetKey} />
      {state === 'sent' ? (
        <p className="text-sm text-emerald-300 flex items-start gap-2" role="status">
          <MailCheck className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          If that email is registered, your pass is on its way. Check your inbox and spam folder.
        </p>
      ) : (
        <button
          type="submit"
          disabled={state === 'sending' || (turnstileEnabled && !token)}
          className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === 'sending' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          <span>{state === 'sending' ? 'Sending…' : 'Resend my pass'}</span>
        </button>
      )}
    </form>
  );
}

export default function RegistrationForm({ status, statusError, onRegistered }) {
  const [formData, setFormData] = useState({ name: '', email: '', reg_no: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(null); // { email, emailSent }
  const [token, setToken] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const onToken = useCallback((t) => setToken(t), []);

  const maxSeats = status?.max_seats ?? 0;
  const registered = status?.registered ?? 0;
  const seatsRemaining = Math.max(0, maxSeats - registered);
  const ended = status ? isEventOver(status.event_date) : false;
  const closed = status ? !status.registration_open : false;
  const full = status ? seatsRemaining <= 0 : false;
  const blocked = !status || ended || closed || full;
  const fillPercent = maxSeats > 0 ? Math.min(100, (registered / maxSeats) * 100) : 100;

  const badge = !status
    ? { text: statusError ? 'Status unavailable' : 'Loading…', tone: 'neutral' }
    : ended
      ? { text: 'Event Ended', tone: 'bad' }
      : closed
        ? { text: 'Registration Closed', tone: 'bad' }
        : full
          ? { text: 'Seats Full', tone: 'bad' }
          : { text: `${seatsRemaining} Seat${seatsRemaining === 1 ? '' : 's'} Left`, tone: 'good' };

  const buttonLabel = !status
    ? 'Loading…'
    : ended
      ? 'Event Ended'
      : closed
        ? 'Registration Closed'
        : full
          ? 'Seats Full'
          : 'Register & Get My Pass';

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
    if (serverError) setServerError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (blocked || isSubmitting) return;
    setServerError('');

    const clean = normalizeRegistration(formData);
    const fieldErrors = validateRegistration(clean);
    if (fieldErrors) {
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    const result = await registerAttendee({ ...clean, turnstileToken: token });
    setIsSubmitting(false);
    setResetKey((k) => k + 1);

    if (result.ok) {
      setDone({ email: result.email, emailSent: result.emailSent });
      onRegistered?.();
      return;
    }
    if (result.fields) setErrors(result.fields);
    setServerError(messageFor(result.error));
    if (['CAPACITY_REACHED', 'REGISTRATION_CLOSED', 'EVENT_ENDED'].includes(result.error)) onRegistered?.();
  };

  if (done) {
    return (
      <div className="w-full max-w-lg mx-auto bg-[#0a0a0a] border border-white/20 p-6 sm:p-8 rounded-2xl animate-fade-in-up text-center space-y-5">
        <div className="inline-flex items-center gap-2 text-emerald-300 text-sm font-medium bg-emerald-950/40 border border-emerald-500/30 px-4 py-2 rounded-full">
          <CheckCircle className="w-4 h-4" aria-hidden="true" />
          <span>Registration Confirmed</span>
        </div>
        {done.emailSent ? (
          <p className="text-gray-300 text-sm leading-relaxed" role="status">
            Your entry pass (QR code) has been emailed to <strong className="text-white break-all">{done.email}</strong>.
            Show it at the venue door. Can&apos;t find it? Check your spam folder.
          </p>
        ) : (
          <p className="text-amber-300 text-sm leading-relaxed" role="alert">
            You&apos;re registered, but we couldn&apos;t send the pass email right now. Use the button below to resend it to{' '}
            <strong className="break-all">{done.email}</strong> in a couple of minutes.
          </p>
        )}
        <div className="pt-2 border-t border-white/10">
          <div className="pt-4">
            <ResendPass />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto bg-[#0a0a0a] border border-white/30 border-t-2 border-t-white p-6 sm:p-8 shadow-[0_-4px_30px_rgba(255,255,255,0.35),0_0_40px_rgba(255,255,255,0.15)] relative rounded-2xl animate-fade-in-up transition-colors duration-300 hover:border-white/50">
      <div
        className="absolute -top-[2px] left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_20px_#ffffff] rounded-full z-20 pointer-events-none"
        aria-hidden="true"
      />

      <div className="mb-6 border-b border-white/10 pb-4 relative z-10">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Event Seat Status</span>
          <span
            aria-live="polite"
            className={`text-xs px-3 py-1 font-semibold uppercase tracking-wider rounded-full ${
              badge.tone === 'bad'
                ? 'bg-red-950 text-red-300 border border-red-800/50'
                : 'bg-white/10 text-white border border-white/10'
            }`}
          >
            {badge.text}
          </span>
        </div>
        <div
          className="w-full bg-white/10 h-1.5 mt-3 overflow-hidden rounded-full relative"
          role="progressbar"
          aria-label="Seats filled"
          aria-valuemin={0}
          aria-valuemax={maxSeats}
          aria-valuenow={registered}
        >
          <div
            className="bg-white h-full transition-all duration-500 rounded-full relative overflow-hidden shimmer-bar"
            style={{ width: `${status ? fillPercent : 0}%` }}
          />
        </div>
      </div>

      <h2 className="text-2xl font-bold tracking-tight text-white mb-1 relative z-10">Event Registration</h2>
      <p className="text-sm text-gray-400 mb-6 relative z-10">
        Fill in your VIT student details. Your entry pass will be emailed to your VIT inbox.
      </p>

      {serverError && (
        <div
          className="mb-6 bg-red-950/50 border border-red-500/30 text-red-300 px-4 py-3 text-sm flex items-start gap-2 rounded-xl animate-fade-in-up relative z-10"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5 relative z-10">
        <Field
          id="name"
          label="Full Name"
          icon={User}
          type="text"
          autoComplete="name"
          maxLength={100}
          placeholder="e.g. Snake Babu"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          disabled={blocked || isSubmitting}
          error={errors.name}
        />
        <Field
          id="email"
          label="VIT Email Address"
          icon={Mail}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="e.g. snake.b2025@vitstudent.ac.in"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          disabled={blocked || isSubmitting}
          error={errors.email}
        />
        <Field
          id="reg_no"
          label="Registration Number"
          icon={Hash}
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={9}
          placeholder="e.g. 25BCE1234"
          value={formData.reg_no}
          onChange={(e) => handleChange('reg_no', e.target.value)}
          disabled={blocked || isSubmitting}
          error={errors.reg_no}
          className="uppercase placeholder:normal-case"
        />

        {!blocked && <Turnstile onToken={onToken} resetKey={resetKey} />}

        <button
          type="submit"
          disabled={blocked || isSubmitting || (turnstileEnabled && !token)}
          className="btn-hero w-full flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-lg active:scale-[0.99]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>Registering…</span>
            </>
          ) : (
            <span>{buttonLabel}</span>
          )}
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-white/10 text-center relative z-10">
        <ResendPass />
      </div>
    </div>
  );
}

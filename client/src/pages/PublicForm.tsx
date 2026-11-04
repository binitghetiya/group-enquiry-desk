import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError, type EnquiryTypeOption, type FieldErrors } from '../api';

interface FormConfig {
  brand: { name: string; notice: string | null };
  enquiryTypes: EnquiryTypeOption[];
  formToken: string;
}

const EMPTY = { fullName: '', email: '', enquiryType: '', message: '', preferredDate: '', website: '' };
const today = () => new Date().toISOString().slice(0, 10);

function FieldError({ errors, name }: { errors: FieldErrors; name: string }) {
  const msg = errors[name]?.[0];
  return msg ? (
    <p className="field-error" id={`${name}-error`} role="alert">
      {msg}
    </p>
  ) : null;
}

export function PublicForm() {
  const { siteKey = '' } = useParams();
  const [config, setConfig] = useState<FormConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const c = await api<FormConfig>(`/api/public/form-config/${encodeURIComponent(siteKey)}`);
      setConfig(c);
      setValues((v) => ({ ...v, enquiryType: v.enquiryType || (c.enquiryTypes.length === 1 ? c.enquiryTypes[0]!.value : '') }));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Could not load the form.');
    }
  }, [siteKey]);

  useEffect(() => {
    setConfig(null);
    setValues(EMPTY);
    setDone(false);
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (config) document.title = `Enquire - ${config.brand.name}`;
  }, [config]);

  const set = (name: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      await api('/api/public/enquiries', { method: 'POST', body: { ...values, formToken: config.formToken } });
      setDone(true);
      setValues(EMPTY);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setErrors(err.fields);
        setFormError(err.message);
        // A used or expired token cannot be retried: fetch a fresh one.
        if (err.code === 'FORM_INVALID' || err.code === 'ALREADY_SUBMITTED') void loadConfig();
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <p className="alert alert-error">{loadError}</p>;
  if (!config) return <p className="muted">Loading form…</p>;

  if (done) {
    return (
      <section className="panel narrow">
        <h1>Thank you</h1>
        <p>Your enquiry has been sent to the {config.brand.name} team. We will reply by email.</p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setDone(false);
            void loadConfig();
          }}
        >
          Send another enquiry
        </button>
      </section>
    );
  }

  const describedBy = (name: string) => (errors[name] ? `${name}-error` : undefined);

  return (
    <section className="panel narrow">
      <h1>Contact {config.brand.name}</h1>
      {config.brand.notice && <p className="alert alert-info">{config.brand.notice}</p>}
      {formError && (
        <p className="alert alert-error" role="alert">
          {formError}
        </p>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="fullName">Full name</label>
          <input id="fullName" name="fullName" autoComplete="name" required minLength={2} maxLength={100}
            value={values.fullName} onChange={set('fullName')} aria-invalid={!!errors.fullName} aria-describedby={describedBy('fullName')} />
          <FieldError errors={errors} name="fullName" />
        </div>

        <div className="field">
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" required maxLength={254}
            value={values.email} onChange={set('email')} aria-invalid={!!errors.email} aria-describedby={describedBy('email')} />
          <FieldError errors={errors} name="email" />
        </div>

        <div className="field">
          <label htmlFor="enquiryType">Enquiry type</label>
          <select id="enquiryType" name="enquiryType" required value={values.enquiryType} onChange={set('enquiryType')}
            aria-invalid={!!errors.enquiryType} aria-describedby={describedBy('enquiryType')}>
            <option value="">Choose…</option>
            {config.enquiryTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <FieldError errors={errors} name="enquiryType" />
        </div>

        <div className="field">
          <label htmlFor="message">Message</label>
          <textarea id="message" name="message" rows={6} required minLength={10} maxLength={2000}
            value={values.message} onChange={set('message')} aria-invalid={!!errors.message} aria-describedby={describedBy('message')} />
          <p className="hint">{values.message.length}/2000</p>
          <FieldError errors={errors} name="message" />
        </div>

        <div className="field">
          <label htmlFor="preferredDate">
            Preferred date <span className="muted">(optional)</span>
          </label>
          <input id="preferredDate" name="preferredDate" type="date" min={today()}
            value={values.preferredDate} onChange={set('preferredDate')} aria-invalid={!!errors.preferredDate} aria-describedby={describedBy('preferredDate')} />
          <FieldError errors={errors} name="preferredDate" />
        </div>

        {/* Honeypot: hidden from people and assistive tech; bots that fill it are silently ignored. */}
        <div className="hp" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set('website')} />
        </div>

        <p className="hint">
          We use your details only to reply to this enquiry. Please do not include passwords, payment or medical details.
        </p>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send enquiry'}
        </button>
      </form>
    </section>
  );
}

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, type EnquiryTypeOption, type FieldErrors } from '../api';
import { Alert, brandClass, Icon, monogram, Spinner } from '../components/ui';

interface FormConfig {
  brand: { name: string; notice: string | null };
  enquiryTypes: EnquiryTypeOption[];
  formToken: string;
}

const EMPTY = { fullName: '', email: '', enquiryType: '', message: '', preferredDate: '', website: '' };
const today = () => new Date().toISOString().slice(0, 10);
const MESSAGE_MAX = 2000;

function FieldError({ errors, name }: { errors: FieldErrors; name: string }) {
  const msg = errors[name]?.[0];
  return msg ? (
    <p className="field-error" id={`${name}-error`} role="alert">
      <Icon name="alert" />
      <span>{msg}</span>
    </p>
  ) : null;
}

function FormSkeleton() {
  return (
    <div className="form-page brand-none">
      <section className="panel form-card">
        <p className="sr-only" role="status">
          Loading form…
        </p>
        <div className="skeleton-group" aria-hidden="true">
          <span className="skeleton skeleton-badge" />
          <span className="skeleton skeleton-title" />
          <span className="skeleton skeleton-line" />
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="skeleton-field">
              <span className="skeleton skeleton-label" />
              <span className="skeleton skeleton-input" />
            </span>
          ))}
        </div>
      </section>
    </div>
  );
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
  const doneHeading = useRef<HTMLHeadingElement>(null);

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

  // Move focus to the confirmation so keyboard and screen reader users hear the outcome.
  useEffect(() => {
    if (done) doneHeading.current?.focus();
  }, [done]);

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

  const theme = brandClass(siteKey);

  if (loadError) {
    return (
      <div className="form-page brand-none">
        <section className="panel form-card">
          <Alert
            tone="error"
            role="alert"
            title="This form could not be loaded"
            action={
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadConfig()}>
                <Icon name="refresh" />
                <span>Try again</span>
              </button>
            }
          >
            <p>{loadError}</p>
          </Alert>
          <p className="form-back">
            <Link to="/">Back to all enquiry forms</Link>
          </p>
        </section>
      </div>
    );
  }
  if (!config) return <FormSkeleton />;

  const header = (
    <div className="form-brand">
      <span className="brand-badge" aria-hidden="true">
        {monogram(config.brand.name)}
      </span>
      <span className="form-brand-name">{config.brand.name}</span>
    </div>
  );

  if (done) {
    return (
      <div className={`form-page ${theme}`}>
        <section className="panel form-card form-success" aria-labelledby="done-title">
          {header}
          <span className="success-icon">
            <Icon name="check-circle" />
          </span>
          <h1 id="done-title" ref={doneHeading} tabIndex={-1}>
            Thank you
          </h1>
          <p className="lead">Your enquiry has been sent to the {config.brand.name} team. We will reply by email.</p>
          <div className="actions actions-center">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setDone(false);
                void loadConfig();
              }}
            >
              Send another enquiry
            </button>
          </div>
        </section>
      </div>
    );
  }

  const describedBy = (name: string) => (errors[name] ? `${name}-error` : undefined);
  const messageOver = values.message.length > MESSAGE_MAX;

  return (
    <div className={`form-page ${theme}`}>
      <section className="panel form-card" aria-labelledby="form-title">
        {header}
        <h1 id="form-title">Contact {config.brand.name}</h1>
        <p className="form-intro">
          Tell us what you need and the team will reply by email. All fields are required unless marked optional.
        </p>

        {config.brand.notice && (
          <Alert tone="info" icon="shield" title="Before you write">
            <p>{config.brand.notice}</p>
          </Alert>
        )}
        {formError && (
          <Alert tone="error" role="alert" title="Your enquiry was not sent">
            <p>{formError}</p>
          </Alert>
        )}

        <form onSubmit={onSubmit} noValidate className="form">
          <div className="form-row">
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
            <div className="label-row">
              <label htmlFor="message">Message</label>
              <span id="message-count" className={`counter${messageOver ? ' over' : ''}`}>
                {values.message.length}/{MESSAGE_MAX}
              </span>
            </div>
            <textarea id="message" name="message" rows={6} required minLength={10} maxLength={MESSAGE_MAX}
              value={values.message} onChange={set('message')} aria-invalid={!!errors.message}
              aria-describedby={[describedBy('message'), 'message-count'].filter(Boolean).join(' ')} />
            <FieldError errors={errors} name="message" />
          </div>

          <div className="field field-half">
            <label htmlFor="preferredDate">
              Preferred date <span className="label-optional">(optional)</span>
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

          <div className="form-footer">
            <p className="privacy-note">
              <Icon name="lock" />
              <span>
                We use your details only to reply to this enquiry. Please do not include passwords, payment or medical
                details.
              </span>
            </p>
            <button type="submit" className="btn btn-primary btn-lg btn-block-mobile" disabled={submitting} aria-busy={submitting}>
              {submitting ? (
                <>
                  <Spinner />
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <span>Send enquiry</span>
                  <Icon name="arrow-right" />
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

import { useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import CommerceDemo from '../components/login/CommerceDemo';
import fullLogo from '@assets/HFULL_NOBGSVG.svg';
import './login.css';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      setLocation('/dashboard');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-showcase" aria-label="WhatsApp commerce demo">
        <div className="showcase-orbit showcase-orbit-one" aria-hidden="true" />
        <div className="showcase-orbit showcase-orbit-two" aria-hidden="true" />
        <div className="showcase-inner">
          <div className="showcase-brand">
            <img src={fullLogo} alt="ATWASSUP logo" data-testid="img-brand-logo" />
            <span className="brand-caption">Commerce, in conversation.</span>
          </div>
          <div className="showcase-copy">
            <p className="login-kicker"><span /> THE WHATSAPP COMMERCE WORKSPACE</p>
            <h1>From a simple<br /><em>hello</em> to an order.</h1>
            <p className="showcase-description">
              Turn product templates into helpful conversations, smooth checkouts, and paid orders — all inside WhatsApp.
            </p>
          </div>
          <CommerceDemo />
          <div className="showcase-foot">
            <span className="foot-rule" />
            <span>One conversation. Every step handled.</span>
            <span className="foot-index">01 — 06</span>
          </div>
        </div>
      </section>

      <section className="login-panel" aria-label="Sign in">
        <div className="login-panel-top">
          <span className="secure-note"><LockKeyhole size={14} strokeWidth={1.8} /> SECURE WORKSPACE ACCESS</span>
          <span className="panel-mark">ATWASSUP <span>／</span> WORKSPACE</span>
        </div>
        <div className="login-form-wrap">
          <div className="form-intro">
            <div className="form-eyebrow">WELCOME BACK</div>
            <h2>Your business,<br /><span>right where you left it.</span></h2>
            <p>Sign in to continue to your WhatsApp workspace.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="login-form" noValidate>
            <div className="login-field">
              <label htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
                data-testid="input-email"
                {...register('email')}
              />
              {errors.email && <p id="login-email-error" className="login-error" role="alert" data-testid="text-email-error">{errors.email.message}</p>}
            </div>
            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'login-password-error' : undefined}
                data-testid="input-password"
                {...register('password')}
              />
              {errors.password && <p id="login-password-error" className="login-error" role="alert" data-testid="text-password-error">{errors.password.message}</p>}
            </div>
            <button type="submit" className="login-submit" disabled={submitting} data-testid="button-submit">
              {submitting ? <><Loader2 className="login-loader" size={18} /> Signing in…</> : <>Sign in to your workspace <ArrowRight size={17} /></>}
            </button>
          </form>

          <div className="login-trust" data-testid="text-security-note">
            <ShieldCheck size={17} strokeWidth={1.8} />
            <span>Your account is protected with secure sign-in.</span>
          </div>
        </div>
        <div className="login-panel-bottom">
          <span>Built for conversations that move business forward.</span>
          <span className="copyright">ATWASSUP</span>
        </div>
      </section>
    </main>
  );
}
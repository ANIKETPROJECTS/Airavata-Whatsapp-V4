import { useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import CommerceDemo from '../components/login/CommerceDemo';
import { LoginJourney } from '../components/login/LoginValueProps';
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
        <div className="showcase-inner">
          <LoginJourney />
          <CommerceDemo />
        </div>
      </section>

      <section className="login-panel" aria-label="Sign in">
        <div className="login-panel-content">
          <div className="login-form-wrap">
            <div className="form-intro">
              <img className="login-brand-logo" src={fullLogo} alt="AtWassup" />
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
          </div>
        </div>
      </section>
    </main>
  );
}
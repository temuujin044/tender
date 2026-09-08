'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Brand } from '@/components/brand';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  User,
  Lock,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { setStoredAuthState } from '@/lib/auth';
import { loginAccount } from '@/lib/api';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [redirectPath, setRedirectPath] = useState('/dashboard');
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    remember: false,
  });
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedRedirect = params.get('redirect');
    if (params.get('registered') === 'true') {
      setSuccessMessage(
        'Бүртгэл амжилттай үүслээ. Шинэ хэрэглэгчийн нэр, нууц үгээрээ нэвтэрнэ үү.'
      );
    }

    if (requestedRedirect && requestedRedirect.startsWith('/')) {
      setRedirectPath(requestedRedirect);
    }
  }, []);

  const login = async (username: string, password: string) => {
    setError('');
    setIsLoading(true);

    try {
      const session = await loginAccount(username.trim(), password);
      if (!session.success) throw new Error(session.message || 'Нэвтрэх мэдээлэл буруу байна.');

      if (session.role === 'employee' && session.empid) {
        const employeeUser = {
          role: 'employee' as const,
          employeeId: session.empid,
          userId: session.userid,
          token: session.token,
          username: username.trim(),
          vendorName: 'Монголын Алт (МАК) ХХК',
          email: username.trim(),
          contactName: session.username || username.trim(),
        };
        setStoredAuthState(true, employeeUser);
        const target = redirectPath.startsWith('/employee') ? redirectPath : '/employee';
        window.location.assign(target);
        return;
      }

      if (!session.vendorid) throw new Error(session.message || 'Нэвтрэх мэдээлэл буруу байна.');
      const user = {
        role: 'vendor' as const,
        vendorId: session.vendorid,
        userId: session.userid,
        token: session.token,
        username: username.trim(),
        vendorName: session.username || username.trim(),
        email: '',
        contactName: session.username || username.trim(),
      };
      setStoredAuthState(true, user);
      const target = redirectPath.startsWith('/employee') ? '/dashboard' : redirectPath;
      window.location.assign(target);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Хэрэглэгчийн нэр эсвэл нууц үг буруу байна.'
      );
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void login(formData.username, formData.password);
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Left side - Branding */}
      <div className="hidden w-1/2 bg-slate-900 lg:flex lg:flex-col lg:justify-between lg:p-12 relative overflow-hidden">
        {/* Background decorative blob */}
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-orange-500/10 blur-3xl"></div>

        <Brand
          href="/"
          size="lg"
          priority
          className="relative z-10"
          textClassName="font-bold text-white"
        />

        <div className="max-w-md relative z-10">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white mb-6">
            МАК Тендер платформд тавтай морил
          </h1>
          <p className="text-lg text-slate-300">
            Хяналтын самбартаа нэвтэрч, тендерүүдээ удирдан, саналуудаа хянаарай.
          </p>
        </div>

        <p className="text-sm text-slate-500 relative z-10">
          &copy; {new Date().getFullYear()} МАК Тендер. Бүх эрх хуулиар хамгаалагдсан.
        </p>
      </div>

      {/* Right side - Form */}
      <div className="flex w-full items-center justify-center px-4 py-12 lg:w-1/2 lg:px-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 flex justify-center lg:hidden">
            <Brand href="/" size="md" priority textClassName="font-bold text-slate-900" />
          </div>

          <Card className="border-slate-200 bg-white shadow-xl shadow-slate-200/50 rounded-2xl">
            <CardHeader className="space-y-2 pb-6 px-6 pt-8">
              <CardTitle className="text-2xl font-bold text-slate-900">Нэвтрэх</CardTitle>
              <CardDescription className="text-slate-500">
                Ажилтан ERP и-мэйл, нууц үгээрээ; нийлүүлэгч Tender бүртгэлээрээ нэвтэрнэ.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                {successMessage && (
                  <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>{successMessage}</p>
                  </div>
                )}
                {error && (
                  <div className="flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-600 border border-red-100">
                    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                    <p>{error}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="username" className="text-slate-700">
                    И-мэйл эсвэл хэрэглэгчийн нэр
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="username"
                      placeholder="И-мэйл эсвэл хэрэглэгчийн нэр"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="h-11 pl-10 bg-slate-50 border-slate-200 transition-colors focus-visible:bg-white focus-visible:ring-orange-500"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-slate-700">
                      Нууц үг
                    </Label>
                    <Link
                      href="/forgot-password"
                      className="text-sm font-medium text-orange-600 hover:text-orange-700 hover:underline transition-colors"
                    >
                      Нууц үг мартсан?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="h-11 pl-10 pr-10 bg-slate-50 border-slate-200 transition-colors focus-visible:bg-white focus-visible:ring-orange-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <Checkbox
                    id="remember"
                    checked={formData.remember}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, remember: checked as boolean })
                    }
                    className="rounded-lg border-slate-300 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                  />
                  <Label
                    htmlFor="remember"
                    className="text-sm font-normal text-slate-600 cursor-pointer"
                  >
                    30 хоногийн турш сануулах
                  </Label>
                </div>

                <Button
                  type="submit"
                  className="h-12 w-full mt-2 bg-orange-500 text-white hover:bg-orange-600 font-medium shadow-md shadow-orange-500/20 transition-all active:scale-[0.98]"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Нэвтэрч байна...
                    </>
                  ) : (
                    <>
                      Нэвтрэх
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-8 text-center text-sm text-slate-500">
                {'Бүртгэлгүй юу? '}
                <Link
                  href="/register"
                  className="font-semibold text-orange-600 hover:text-orange-700 hover:underline transition-colors"
                >
                  Нийлүүлэгчээр бүртгүүлэх
                </Link>
              </div>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-slate-500 lg:hidden">
            &copy; {new Date().getFullYear()} МАК Тендер. Бүх эрх хуулиар хамгаалагдсан.
          </p>
        </div>
      </div>
    </div>
  );
}

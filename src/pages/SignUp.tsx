import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";

export default function SignUp() {
  const navigate = useNavigate();
  const { user, register, error, loading } = useAuth();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedNickname = nickname.trim();

    if (!trimmedNickname || !password) {
      setFormError(t("signup.validation"));
      return;
    }

    if (password.length < 6) {
      setFormError(t("signup.passwordLength"));
      return;
    }

    if (password !== confirmPassword) {
      setFormError(t("signup.passwordMismatch"));
      return;
    }

    setFormError(null);
    const success = await register(trimmedNickname, password, remember);
    if (success) {
      navigate("/", { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md p-8 space-y-6 shadow-lg">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">{t("signup.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("signup.subtitle")}</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="nickname">{t("signup.nickname")}</Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder={t("signup.nickname.placeholder")}
              autoComplete="username"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("signup.password")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("signup.password.placeholder")}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("signup.confirmPassword")}</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={t("signup.confirmPassword.placeholder")}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="remember"
              checked={remember}
              onCheckedChange={(checked) => setRemember(Boolean(checked))}
            />
            <Label htmlFor="remember" className="text-sm text-muted-foreground">
              {t("login.remember")}
            </Label>
          </div>

          {(formError || error) && (
            <p className="text-sm text-destructive">{formError ?? error}</p>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? t("signup.submitting") : t("signup.submit")}
          </Button>
        </form>

        <div className="text-sm text-center text-muted-foreground">
          <p>
            {t("signup.haveAccount")}{" "}
            <Link to="/login" className="text-primary hover:underline">{t("signup.login")}</Link>
          </p>
        </div>
      </Card>
    </div>
  );
}

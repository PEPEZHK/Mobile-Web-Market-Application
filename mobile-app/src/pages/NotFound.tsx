import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/Layout";
import { useTranslation } from "@/hooks/useTranslation";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <Layout title={t("notFound.title")}>
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <h2 className="text-6xl font-bold text-foreground">404</h2>
        <p className="text-lg text-muted-foreground">{t("notFound.message")}</p>
        <Button onClick={() => navigate("/")}>{t("notFound.back")}</Button>
      </div>
    </Layout>
  );
};

export default NotFound;

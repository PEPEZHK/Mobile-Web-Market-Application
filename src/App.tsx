import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { initDatabase } from "@/lib/db";
import Depot from "./pages/Depot";
import Sales from "./pages/Sales";
import Customers from "./pages/Customers";
import History from "./pages/History";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import ShoppingList from "./pages/ShoppingList";
import ShoppingListDetail from "./pages/ShoppingListDetail";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useTranslation } from "@/hooks/useTranslation";

const queryClient = new QueryClient();
const App = () => {
  const [isDbReady, setIsDbReady] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    initDatabase().then(() => {
      setIsDbReady(true);
    }).catch(error => {
      console.error("Failed to initialize database:", error);
    });
  }, []);

  if (!isDbReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t("app.initializing", { defaultValue: "Initializing database..." })}</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/" element={<ProtectedRoute><Depot /></ProtectedRoute>} />
              <Route path="/sales" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
              <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
              <Route path="/shopping-list" element={<ProtectedRoute><ShoppingList /></ProtectedRoute>} />
              <Route path="/shopping-list/:id" element={<ProtectedRoute><ShoppingListDetail /></ProtectedRoute>} />
              <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="*" element={<ProtectedRoute><NotFound /></ProtectedRoute>} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

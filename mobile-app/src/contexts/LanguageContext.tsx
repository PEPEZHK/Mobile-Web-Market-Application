import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'en' | 'tr' | 'ru';

interface TranslationValues {
  readonly [key: string]: string | number;
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  availableLanguages: Array<{ value: Language; label: string }>;
  t: (key: string, options?: { defaultValue?: string; values?: TranslationValues }) => string;
}

const STORAGE_KEY = 'offline-stock-language';

const languageLabels: Record<Language, string> = {
  en: 'English',
  tr: 'Türkçe',
  ru: 'Русский'
};

const translations: Record<Language, Record<string, string>> = {
  en: {
    'common.cancel': 'Cancel',
    'app.name': 'Offline Stock App',
    'login.title': 'Offline Stock App',
    'login.subtitle': 'Sign in to continue.',
    'login.nickname': 'Nickname',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.signup.question': 'Need an account?',
    'login.signup.link': 'Sign up',
    'signup.title': 'Create an account',
    'signup.submit': 'Create account',
    'inventory.title': 'Inventory',
    'inventory.search': 'Search products by name or barcode',
    'inventory.empty': 'No products yet. Add your first item.',
    'inventory.add': 'Add product',
    'sales.title': 'Sales',
    'sales.customer': 'Customer',
    'sales.saleType': 'Sale type',
    'sales.saleType.paid': 'Fully paid',
    'sales.saleType.debt': 'Debt',
    'sales.complete': 'Complete sale',
    'sales.total': 'Total',
    'sales.paid': 'Paid',
    'sales.debt': 'Debt',
    'sales.customer.none': 'Add a customer to start selling.',
    'sales.debtNote': 'Select a customer to track debt sales.',
    'sales.searchProducts': 'Search products',
    'sales.openCatalog': 'Catalog',
    'customers.title': 'Customers',
    'customers.add': 'Add customer',
    'customers.transactions': 'Transactions',
    'customers.transactions.view': 'View transactions',
    'customers.transactions.hide': 'Hide transactions',
    'customers.noTransactions': 'No transactions yet',
    'customers.export.all': 'Export all',
    'customers.export.columns.transactionId': 'Transaction ID',
    'customers.export.columns.date': 'Date',
    'customers.export.columns.status': 'Payment Status',
    'customers.export.columns.transactionTotal': 'Total',
    'customers.export.columns.customerId': 'Customer ID',
    'customers.export.columns.customerName': 'Customer Name',
    'customers.export.columns.phone': 'Phone',
    'customers.export.columns.notes': 'Notes',
    'customers.status.debt': 'Debt',
    'customers.status.paid': 'Paid',
    'customers.form.name': 'Name',
    'customers.form.phone': 'Phone',
    'customers.form.notes': 'Notes',
    'customers.form.save': 'Save customer',
    'customers.dialog.add': 'Add customer',
    'customers.dialog.edit': 'Edit customer',
    'customers.empty': 'No customers yet.',
    'settings.title': 'Settings',
    'settings.signOut': 'Sign out',
    'settings.viewHistory': 'View sales history',
    'settings.language': 'Language',
    'settings.theme': 'Theme',
    'settings.reset': 'This removes every locally stored record. Continue?',
    'history.title': 'History',
    'history.search': 'Search by product, customer, or ID',
    'export.share': 'Share',
    'export.error': 'Export failed',
    'shopping.title': 'Shopping Lists',
    'shopping.form.customerUnassigned': 'Uncategorized'
  },
  ru: {
    'common.cancel': 'Отмена',
    'app.name': 'Оффлайн склад',
    'login.title': 'Оффлайн склад',
    'login.subtitle': 'Войдите, чтобы продолжить.',
    'login.nickname': 'Логин',
    'login.password': 'Пароль',
    'login.submit': 'Войти',
    'login.signup.question': 'Нужна учетная запись?',
    'login.signup.link': 'Зарегистрироваться',
    'signup.title': 'Создать учетную запись',
    'signup.submit': 'Создать аккаунт',
    'inventory.title': 'Склад',
    'inventory.search': 'Поиск по названию или штрихкоду',
    'inventory.empty': 'Товаров нет. Добавьте первый.',
    'inventory.add': 'Добавить товар',
    'sales.title': 'Продажи',
    'sales.customer': 'Клиент',
    'sales.saleType': 'Тип продажи',
    'sales.saleType.paid': 'Оплачено',
    'sales.saleType.debt': 'Долг',
    'sales.complete': 'Завершить продажу',
    'sales.total': 'Итого',
    'sales.paid': 'Оплачено',
    'sales.debt': 'Долг',
    'sales.customer.none': 'Добавьте клиента, чтобы продавать в долг.',
    'sales.debtNote': 'Выберите клиента для учета долгов.',
    'sales.searchProducts': 'Поиск товаров',
    'sales.openCatalog': 'Каталог',
    'customers.title': 'Клиенты',
    'customers.add': 'Добавить клиента',
    'customers.transactions': 'Сделки',
    'customers.transactions.view': 'Показать сделки',
    'customers.transactions.hide': 'Скрыть сделки',
    'customers.noTransactions': 'Сделок пока нет',
    'customers.export.all': 'Экспортировать все',
    'customers.export.columns.transactionId': 'Сделка',
    'customers.export.columns.date': 'Дата',
    'customers.export.columns.status': 'Статус',
    'customers.export.columns.transactionTotal': 'Сумма',
    'customers.export.columns.customerId': 'Клиент ID',
    'customers.export.columns.customerName': 'Клиент',
    'customers.export.columns.phone': 'Телефон',
    'customers.export.columns.notes': 'Заметки',
    'customers.status.debt': 'Долг',
    'customers.status.paid': 'Оплачено',
    'customers.form.name': 'Имя',
    'customers.form.phone': 'Телефон',
    'customers.form.notes': 'Заметки',
    'customers.form.save': 'Сохранить',
    'customers.dialog.add': 'Добавить клиента',
    'customers.dialog.edit': 'Редактировать клиента',
    'customers.empty': 'Клиентов нет.',
    'settings.title': 'Настройки',
    'settings.signOut': 'Выйти',
    'settings.viewHistory': 'История продаж',
    'settings.language': 'Язык',
    'settings.theme': 'Тема',
    'settings.reset': 'Удалить все локальные данные?',
    'history.title': 'История',
    'history.search': 'Поиск по товарам, клиентам или номеру',
    'export.share': 'Поделиться',
    'export.error': 'Ошибка экспорта',
    'shopping.title': 'Списки закупок',
    'shopping.form.customerUnassigned': 'Без категории'
  },
  tr: {
    'common.cancel': 'İptal',
    'app.name': 'Çevrimdışı Stok',
    'login.title': 'Çevrimdışı Stok',
    'login.subtitle': 'Devam etmek için giriş yapın.',
    'login.nickname': 'Kullanıcı adı',
    'login.password': 'Şifre',
    'login.submit': 'Giriş yap',
    'login.signup.question': 'Hesabın yok mu?',
    'login.signup.link': 'Kayıt ol',
    'signup.title': 'Hesap oluştur',
    'signup.submit': 'Hesap oluştur',
    'inventory.title': 'Depo',
    'inventory.search': 'İsme veya barkoda göre ara',
    'inventory.empty': 'Henüz ürün yok. İlk ürünü ekleyin.',
    'inventory.add': 'Ürün ekle',
    'sales.title': 'Satışlar',
    'sales.customer': 'Müşteri',
    'sales.saleType': 'Satış tipi',
    'sales.saleType.paid': 'Ödendi',
    'sales.saleType.debt': 'Borç',
    'sales.complete': 'Satışı tamamla',
    'sales.total': 'Toplam',
    'sales.paid': 'Ödendi',
    'sales.debt': 'Borç',
    'sales.customer.none': 'Satış için müşteri ekleyin.',
    'sales.debtNote': 'Borç satışı için müşteri seçin.',
    'sales.searchProducts': 'Ürün ara',
    'sales.openCatalog': 'Katalog',
    'customers.title': 'Müşteriler',
    'customers.add': 'Müşteri ekle',
    'customers.transactions': 'İşlemler',
    'customers.transactions.view': 'İşlemleri göster',
    'customers.transactions.hide': 'İşlemleri gizle',
    'customers.noTransactions': 'Henüz işlem yok',
    'customers.export.all': 'Hepsini dışa aktar',
    'customers.export.columns.transactionId': 'İşlem',
    'customers.export.columns.date': 'Tarih',
    'customers.export.columns.status': 'Durum',
    'customers.export.columns.transactionTotal': 'Tutar',
    'customers.export.columns.customerId': 'Müşteri ID',
    'customers.export.columns.customerName': 'Müşteri',
    'customers.export.columns.phone': 'Telefon',
    'customers.export.columns.notes': 'Notlar',
    'customers.status.debt': 'Borç',
    'customers.status.paid': 'Ödendi',
    'customers.form.name': 'İsim',
    'customers.form.phone': 'Telefon',
    'customers.form.notes': 'Notlar',
    'customers.form.save': 'Kaydet',
    'customers.dialog.add': 'Müşteri ekle',
    'customers.dialog.edit': 'Müşteri düzenle',
    'customers.empty': 'Müşteri yok.',
    'settings.title': 'Ayarlar',
    'settings.signOut': 'Çıkış',
    'settings.viewHistory': 'Satış geçmişi',
    'settings.language': 'Dil',
    'settings.theme': 'Tema',
    'settings.reset': 'Tüm yerel veriler silinsin mi?',
    'history.title': 'Geçmiş',
    'history.search': 'Ürün, müşteri veya ID ile ara',
    'export.share': 'Paylaş',
    'export.error': 'Dışa aktarma hatası',
    'shopping.title': 'Alışveriş listeleri',
    'shopping.form.customerUnassigned': 'Kategorisiz'
  }
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === 'en' || value === 'tr' || value === 'ru') {
        setLanguage(value);
      }
    });
  }, []);

  const updateLanguage = useCallback((next: Language) => {
    setLanguage(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const translate = useCallback(
    (key: string, options?: { defaultValue?: string; values?: TranslationValues }) => {
      const dictionary = translations[language] || translations.en;
      const template = dictionary[key] ?? options?.defaultValue ?? key;
      if (!options?.values) return template;
      return Object.entries(options.values).reduce(
        (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
        template
      );
    },
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage: updateLanguage,
      availableLanguages: Object.entries(languageLabels).map(([value, label]) => ({
        value: value as Language,
        label
      })),
      t: translate
    }),
    [language, translate, updateLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}

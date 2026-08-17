/**
 * home-popup.tsx
 * Multi-page popup floating over the scanner hero screen.
 * Pages slide left/right within the same fixed-size card.
 *
 * Pages:
 *   0 = main menu
 *   1 = login form (email/pw + provider icons)
 *   2 = Google — Choose an account
 *   3 = Google — Permissions confirmation
 *   4 = terms agreement
 */
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  User, ScanLine, FileText,
  Settings, HelpCircle, ChevronRight, ChevronLeft, Eye, EyeOff, X,
  UserCircle2, Mail, Shield,
  Globe, Lock, Info, Share2, Star, Database,
  Smartphone, Zap, CheckCircle2, Server, Cloud,
  Delete, CheckCircle, ToggleLeft, ToggleRight, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  isPinEnabled, enablePin, verifyPin, disablePin,
  isBiometricEnabled, checkBiometricSupport, registerBiometric, disableBiometric,
  getPinTimeout, setPinTimeout, TIMEOUT_OPTIONS,
} from '@/lib/pin-storage';

/* ── Persisted user ───────────────────────────────────────────────────────── */
const USER_KEY = 'privascan_user';
interface StoredUser {
  name: string;
  email: string;
  initials: string;
  provider: 'google' | 'apple' | 'email';
  joinedAt: string; // ISO date string
  accountType?: 'free' | 'member'; // optional for backward compat
}
function loadUser(): StoredUser | null {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}
function saveUser(u: StoredUser) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
function clearUser() { localStorage.removeItem(USER_KEY); }

interface Props { onClose: () => void }

type Provider = 'google' | 'apple' | 'email';

/* ── static data ─────────────────────────────────────────────────────────── */
type MenuAction = 'signin' | 'scan' | 'help' | 'about' | 'pin' | 'legal-privacy' | 'legal-terms' | 'legal-consent' | null;
const MAIN_ITEMS: { icon: React.ReactNode; label: string; action: MenuAction }[] = [
  { icon: <User      className="w-4 h-4" />, label: 'Account',          action: 'signin' },
  { icon: <ScanLine  className="w-4 h-4" />, label: 'Scan',             action: 'scan'   },
  { icon: <Lock      className="w-4 h-4" />, label: 'App PIN',          action: 'pin'    },
  { icon: <Info      className="w-4 h-4" />, label: 'About PrivaScan',  action: 'about'  },
];
const MORE_ITEMS: { icon: React.ReactNode; label: string; action: MenuAction }[] = [
  { icon: <Settings   className="w-4 h-4" />, label: 'Settings',  action: null   },
  { icon: <HelpCircle className="w-4 h-4" />, label: 'Help',      action: 'help' },
  { icon: <Share2     className="w-4 h-4" />, label: 'Share APP', action: null   },
  { icon: <Star       className="w-4 h-4" />, label: 'Rate APP',  action: null   },
];
const LEGAL_ITEMS: { icon: React.ReactNode; label: string; action: MenuAction }[] = [
  { icon: <Shield   className="w-3.5 h-3.5" />, label: 'Privacy Policy',         action: 'legal-privacy'  },
  { icon: <FileText className="w-3.5 h-3.5" />, label: 'Terms of Use',           action: 'legal-terms'    },
  { icon: <Database className="w-3.5 h-3.5" />, label: 'Data Collection Policy', action: 'legal-consent'  },
];

/* Google G icon */
const GoogleIcon = ({ size = 'w-5 h-5' }: { size?: string }) => (
  <svg viewBox="0 0 24 24" className={`${size} shrink-0`}>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const SIGN_IN_METHODS: { id: Provider; label: string; bg: string; iconEl: React.ReactNode }[] = [
  {
    id: 'google', label: 'Continue with Google',
    bg: 'bg-white border border-gray-300 hover:bg-gray-50',
    iconEl: <GoogleIcon />,
  },
  {
    id: 'apple', label: 'Continue with Apple',
    bg: 'bg-black hover:bg-gray-900',
    iconEl: <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="white"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>,
  },
  {
    id: 'email', label: 'Continue with Email',
    bg: 'bg-emerald-500 hover:bg-emerald-600',
    iconEl: <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
  },
];


/* Mock Google account */
const MOCK_ACCOUNT = { name: 'DY Kim', email: 'yessirh.kim0616@gmail.com', initials: 'DK' };

/* ── App logo SVG ─────────────────────────────────────────────────────────── */
function AppLogo({ size = 'w-14 h-14' }: { size?: string }) {
  return (
    <div className={`${size} rounded-2xl border border-gray-200 bg-white flex items-center justify-center shadow-sm shrink-0`}>
      <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
        <path d="M2,12 L2,2 L12,2"     stroke="#38bdf8" strokeWidth="3.5" fill="none" strokeLinecap="square"/>
        <path d="M36,2 L46,2 L46,12"   stroke="#38bdf8" strokeWidth="3.5" fill="none" strokeLinecap="square"/>
        <path d="M2,36 L2,46 L12,46"   stroke="#38bdf8" strokeWidth="3.5" fill="none" strokeLinecap="square"/>
        <path d="M46,36 L46,46 L36,46" stroke="#38bdf8" strokeWidth="3.5" fill="none" strokeLinecap="square"/>
        <rect x="13" y="9" width="22" height="30" rx="1.5" fill="#c8d8ea"/>
        <path d="M29,9 L35,15 L29,15 Z" fill="#7a9ab8"/>
        <path d="M29,9 L35,9 L35,15 Z" fill="#c8d8ea"/>
        <line x1="17" y1="20" x2="31" y2="20" stroke="#1e3a5f" strokeWidth="2"   strokeLinecap="round"/>
        <line x1="17" y1="24" x2="29" y2="24" stroke="#1e3a5f" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="17" y1="28" x2="31" y2="28" stroke="#1e3a5f" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="17" y1="32" x2="26" y2="32" stroke="#1e3a5f" strokeWidth="1.6" strokeLinecap="round"/>
        <line x1="7"  y1="24" x2="41" y2="24" stroke="#38bdf8" strokeWidth="2"  strokeLinecap="round" opacity="0.9"/>
      </svg>
    </div>
  );
}

/* ── Google-style URL bar ─────────────────────────────────────────────────── */
function GoogleUrlBar({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
      <button onClick={onClose} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700">
        <X className="w-4 h-4" />
      </button>
      <span className="text-[11px] text-gray-500 font-medium">accounts.google.com</span>
      <div className="w-6 h-6 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
      </div>
    </div>
  );
}

/* ── Avatar circle ────────────────────────────────────────────────────────── */
function Avatar({ initials, size = 'w-10 h-10', text = 'text-sm' }: { initials: string; size?: string; text?: string }) {
  return (
    <div className={`${size} rounded-full bg-blue-600 flex items-center justify-center shrink-0`}>
      <span className={`${text} font-bold text-white`}>{initials}</span>
    </div>
  );
}

/* ── Legal document content ───────────────────────────────────────────────── */
const LEGAL_DOCS = {
  terms: {
    title: 'Terms of Service',
    sections: [
      {
        heading: '1. Acceptance of Terms',
        body: 'By installing, creating an account, or using PrivaScan, you agree to be bound by these Terms of Service ("Terms"). If you do not agree, you must not use the app. By using PrivaScan you confirm that you are of legal age or have obtained parental or guardian consent to enter into these Terms.',
      },
      {
        heading: '2. Updates to Terms',
        body: 'We may update these Terms from time to time. If we make important changes, we will notify you in-app or by email before they take effect. Changes will not apply retroactively to disputes that arose before the update date. If you do not agree to the amended Terms, you must stop using PrivaScan and cancel your subscription.',
      },
      {
        heading: '3. License Grant',
        body: 'Subject to your compliance with these Terms, PrivaScan grants you a non-exclusive, limited, revocable, non-transferable right to install and use the app for your personal or business document scanning. This license is for one person and cannot be shared or transferred.',
      },
      {
        heading: '4. Your Content & Ownership',
        body: 'You own the documents and images you scan ("Content"). PrivaScan does not claim any ownership over your Content. We do not scan, review, or access Content stored locally on your device. If you choose to enable cloud sync, only the minimum data necessary to provide the sync service is transferred, and we do not use your Content to train AI models or for advertising purposes.',
      },
      {
        heading: '5. Subscription & Billing',
        body: 'PrivaScan offers a paid monthly subscription. Pricing varies by region and is displayed in your local currency at the time of purchase (e.g. €0.99/month in the EU; pricing for Asia, North America, and other regions is set separately and shown in the App Store or Google Play before you subscribe). Subscriptions auto-renew unless cancelled at least 24 hours before the renewal date through your App Store or Google Play account settings. You are also responsible for any applicable taxes, VAT, mobile carrier fees, or other third-party charges associated with your purchase.',
      },
      {
        heading: '6. Permitted Use & Prohibited Conduct',
        body: 'You may use PrivaScan only for lawful purposes. You must not: (a) scan or distribute illegal, harmful, or privacy-violating content; (b) reverse-engineer, decompile, or disassemble the app; (c) use automated tools to access or scrape PrivaScan; (d) resell or sublicense the app or its output; (e) impersonate another person or entity; (f) violate any applicable local, national, or international law or regulation.',
      },
      {
        heading: '7. Privacy',
        body: 'Your use of PrivaScan is also governed by our Privacy Policy, which is incorporated into these Terms by reference. By using PrivaScan you acknowledge that you have read and understood the Privacy Policy.',
      },
      {
        heading: '8. Age Requirement',
        body: 'You must be at least 14 years old to use PrivaScan. By accepting these Terms you confirm that you meet this age requirement. If we become aware that a user is under 14, we will immediately delete their account and data.',
      },
      {
        heading: '9. Intellectual Property',
        body: "All software, design, trademarks, logos, and branding within PrivaScan are the property of CLASSIC LEGEND and are protected by applicable intellectual property laws. Nothing in these Terms grants you any right to use PrivaScan\u2019s trademarks or branding.",
      },
      {
        heading: '10. Warranty & Indemnification',
        body: 'You warrant that (a) you have all necessary rights and permissions to scan and store any Content you process through PrivaScan, and (b) your use of PrivaScan will not violate any law or third-party rights. You agree to indemnify and hold CLASSIC LEGEND harmless from any claims, damages, or costs (including reasonable legal fees) arising from your Content or your violation of these Terms.',
      },
      {
        heading: '11. Disclaimer & Limitation of Liability',
        body: 'PrivaScan is provided "as is" and "as available" without warranties of any kind, express or implied. To the maximum extent permitted by applicable law, CLASSIC LEGEND is not liable for any indirect, incidental, special, consequential, or punitive damages. Our total liability to you for any claim arising under these Terms shall not exceed the amount you paid us in the 12 months preceding the claim.',
      },
      {
        heading: '12. Termination',
        body: 'You may delete your account at any time from Settings → Account → Delete Account. PrivaScan may suspend or terminate your account if you violate these Terms, engage in fraudulent activity, or fail to pay subscription fees. Upon termination, your license to use the app ends immediately and your data will be deleted within 30 days.',
      },
      {
        heading: '13. File Data Retention Upon App Deletion',
        body: 'Whether your scanned files are kept or deleted when you uninstall PrivaScan depends entirely on where each file was saved:\n\n① Files saved to the device\'s shared storage (data RETAINED)\n\n• iOS: Files exported to the "Files" app (On My iPhone folder, iCloud Drive, etc.) or saved to your Photos library.\n• Android: Files saved to public system folders such as Documents, Download, or DCIM.\n\nResult: Because these files exist independently in the OS shared file system as PDF or image files, uninstalling PrivaScan has no effect on them. They remain fully accessible through any file manager or viewer app. Your data is safe.\n\n② Files kept only in the app\'s private sandbox (data DELETED)\n\nThis applies when a scanned document appears in PrivaScan\'s internal list but you have not yet used "Export / Save to Device" to move it to shared storage.\n\nResult: When the app is uninstalled, the operating system removes the entire app sandbox directory, including all files stored inside it. These files cannot be recovered.\n\nRecommendation: Always export important documents to your device\'s shared storage or a cloud service before uninstalling PrivaScan. CLASSIC LEGEND is not liable for data loss resulting from uninstallation where files were not exported from the app sandbox.',
      },
      {
        heading: '14. Governing Law',
        body: 'If you reside in the European Economic Area (EEA) or United Kingdom, these Terms are governed by the laws of Ireland. If you reside outside the EEA and UK, these Terms are governed by the laws of the State of California, USA, without regard to conflict of law principles. Disputes will be resolved by the courts of the applicable jurisdiction.',
      },
      {
        heading: '15. Contact',
        body: 'For questions about these Terms, contact us at: legal@privascan.app\n\nCLASSIC LEGEND, support@privascan.app',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'Data Controller',
        body: 'PrivaScan is operated by CLASSIC LEGEND ("we", "us", "our"). CLASSIC LEGEND is the data controller responsible for your personal information. If you reside in the European Economic Area (EEA) or UK, the laws of Ireland apply to the processing of your data. If you reside elsewhere, the laws of California, USA apply.',
      },
      {
        heading: '1. What Data We Collect',
        body: 'We collect the following categories of personal data:\n\n• Account data: name, email address, and profile picture provided when you sign in via Google, Apple, phone, or email.\n• Device & technical data: device model, operating system version, app version, unique device identifier, IP address, and language settings — collected for crash reporting and diagnostics.\n• Usage data: features you use, session duration, scan counts, and error logs — collected to improve app stability and performance.\n• Payment data: subscription status and transaction identifiers. Full payment details (card numbers, etc.) are handled exclusively by the App Store or Google Play and are never transmitted to us.',
      },
      {
        heading: '2. Legal Basis for Processing',
        body: 'We process your personal data on the following legal grounds:\n\n• Contract performance: to provide you with the PrivaScan service you have subscribed to.\n• Legitimate interests: to maintain security, prevent fraud, diagnose technical issues, and improve the app — where these interests are not overridden by your rights.\n• Consent: for optional analytics and usage data collection. You may withdraw consent at any time from Settings → Privacy.\n• Legal obligation: where required by applicable law.',
      },
      {
        heading: '3. How We Use Your Data',
        body: 'Your personal data is used to: (a) authenticate your account and provide access to PrivaScan features; (b) process your subscription and manage billing through the App Store or Google Play; (c) diagnose crashes, fix bugs, and improve app performance; (d) send you important service notifications (e.g. policy changes, security alerts). We do not use your data for advertising, and we do not sell your personal data to any third party.',
      },
      {
        heading: '4. Your Scanned Documents',
        body: 'Documents and images you scan are stored locally on your device only. We do not upload, access, review, or process your scanned content on our servers unless you explicitly enable a cloud sync feature. We do not use your document content to train AI or machine learning models.',
      },
      {
        heading: '5. Third-Party Processors',
        body: 'We use a limited number of trusted third-party service providers to operate PrivaScan:\n\n• Google LLC — sign-in authentication (Google Sign-In). Governed by Google\'s Privacy Policy.\n• Apple Inc. — sign-in authentication (Sign in with Apple) and App Store payments. Governed by Apple\'s Privacy Policy.\n• Crash & analytics SDK — anonymised diagnostic data only; no personal content is shared.\n\nWe maintain data processing agreements with all processors and remain responsible if they fail to meet their obligations.',
      },
      {
        heading: '6. Data Security',
        body: 'We implement appropriate technical and organisational measures to protect your personal data, including: TLS 1.3 encryption for all data in transit; encryption at rest for any account data stored on our systems; access controls limiting who within CLASSIC LEGEND can access your data; regular security reviews. No method of transmission or storage is 100% secure. If a data breach occurs that affects your rights, we will notify you as required by applicable law.',
      },
      {
        heading: '7. International Data Transfers',
        body: 'Your personal data may be transferred to and processed in countries outside your country of residence, including countries that may not provide the same level of data protection as your home country. Where we transfer data from the EEA or UK, we ensure appropriate safeguards are in place (such as Standard Contractual Clauses approved by the European Commission).',
      },
      {
        heading: '8. Your Rights',
        body: 'Depending on your location, you may have the following rights regarding your personal data:\n\n• Access: request a copy of the personal data we hold about you.\n• Rectification: ask us to correct inaccurate or incomplete data.\n• Erasure: request deletion of your personal data ("right to be forgotten").\n• Restriction: ask us to pause processing your data in certain circumstances.\n• Portability: receive your data in a structured, machine-readable format.\n• Objection: object to processing based on legitimate interests.\n• Withdraw consent: withdraw any consent you have given at any time, without affecting the lawfulness of prior processing.\n\nTo exercise these rights, contact: privacy@privascan.app. We will respond within 30 days.',
      },
      {
        heading: '9. Data Retention',
        body: 'We retain your personal data for as long as your account is active. Specific retention periods:\n\n• Account data: retained until you delete your account, then permanently removed within 30 days.\n• Crash & diagnostic logs: retained for 90 days, then automatically deleted.\n• Payment transaction records: retained for 7 years as required by tax and accounting laws.\n\nAfter the retention period expires, your data is securely deleted or anonymised.',
      },
      {
        heading: '10. Children\'s Privacy',
        body: 'PrivaScan is not directed at children under 14 years of age. We do not knowingly collect personal information from anyone under 14. If we become aware that we have inadvertently collected such data, we will delete it immediately. If you believe a child under 14 has provided us with personal information, please contact privacy@privascan.app.',
      },
      {
        heading: '11. Changes to This Policy',
        body: 'We may update this Privacy Policy from time to time. When we make significant changes, we will notify you via an in-app notification or email at least 14 days before the changes take effect. The "Last updated" date at the top of this policy will always reflect the most recent version. Continued use of PrivaScan after changes take effect constitutes your acceptance of the updated policy.',
      },
      {
        heading: '12. Contact & Data Protection Officer',
        body: 'For privacy questions, data rights requests, or concerns:\n\nEmail: privacy@privascan.app\nOperator: CLASSIC LEGEND\nGeneral support: support@privascan.app\n\nIf you are located in the EEA and believe we have not adequately addressed your concern, you have the right to lodge a complaint with your local data protection authority.',
      },
      {
        heading: 'Language',
        body: 'This Privacy Policy is provided in English. If you require a translation into your local language, please contact us at info@classic-legend.de and we will do our best to assist you.',
      },
    ],
  },
  consent: {
    title: 'Consent to Collection of Data',
    sections: [
      {
        heading: 'What We Collect',
        body: 'With your consent, PrivaScan collects: (1) Account information — name and email provided at sign-in. (2) Device identifiers — for crash reporting and analytics. (3) App usage data — features used, session duration, error logs.',
      },
      {
        heading: 'Purpose of Collection',
        body: 'Data is collected to: authenticate your account, improve app stability and performance, and provide personalised features such as document sync.',
      },
      {
        heading: 'No Third-Party Advertising',
        body: 'We do not share your personal data with advertisers or data brokers. Analytics data is anonymised before processing.',
      },
      {
        heading: 'Your Rights',
        body: 'You have the right to access, correct, or delete your personal data at any time. You may also withdraw this consent by deleting your account. Withdrawal does not affect the lawfulness of processing before withdrawal.',
      },
      {
        heading: 'Retention Period',
        body: 'Personal data is retained for the duration of your active account plus 30 days after account deletion, unless a longer retention period is required by law.',
      },
      {
        heading: 'Contact',
        body: 'To exercise your data rights or ask questions: privacy@privascan.app',
      },
    ],
  },
} as const;

type LegalDocKey = keyof typeof LEGAL_DOCS;

/** Masks an email: yessirh.kim0616@gmail.com → yes***@gmail.com */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, 3);
  return `${visible}***@${domain}`;
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
export function HomePopup({ onClose }: Props) {
  const [, setLocation] = useLocation();

  // Persisted user
  const [user, setUser] = useState<StoredUser | null>(loadUser);
  useEffect(() => { setUser(loadUser()); }, []);

  // Page 7 account state
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [showTypePicker, setShowTypePicker] = useState(false);
  // Page 8 account detail state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 0 main | 1 login | 2 google-choose | 3 google-perms | 4 sign-up | 5 about | 6 app-pin | 7 account
  const [page,           setPage]           = useState(0);
  const [provider,       setProvider]       = useState<Provider | null>(null);
  const [email,          setEmail]          = useState('');
  const [password,       setPassword]       = useState('');
  const [showPassword,   setShowPassword]   = useState(false);
  // Page 4 sign-up fields
  const [suEmail,        setSuEmail]        = useState('');
  const [suPassword,     setSuPassword]     = useState('');
  const [showSuPassword, setShowSuPassword] = useState(false);
  const [suChecked,      setSuChecked]      = useState(false);
  // Page 3 single-checkbox consent
  const [page3Checked, setPage3Checked] = useState(false);
  // Legal doc overlay: null = hidden, key = which doc to show
  const [legalDoc, setLegalDoc]         = useState<LegalDocKey | null>(null);

  // ── Page 6: App PIN settings state ──────────────────────────────────────
  // pinStatus: live reflection of isPinEnabled()
  const [pinStatus,   setPinStatus]   = useState<boolean>(isPinEnabled);
  const [bioEnabled,  setBioEnabled]  = useState<boolean>(isBiometricEnabled);
  const [bioSupport,  setBioSupport]  = useState<boolean>(false);
  const [pinTimeout,  setPinTimeoutState] = useState<number>(getPinTimeout);

  // PIN entry overlay within card
  // mode: 'none' | 'set-1' (enter new) | 'set-2' (confirm) | 'verify' (verify before disable/change) | 'change-1' | 'change-2'
  const [pinMode,       setPinMode]       = useState<'none'|'set-1'|'set-2'|'verify'|'change-1'|'change-2'>('none');
  const [pinInput,      setPinInput]      = useState('');
  const [pinFirst,      setPinFirst]      = useState('');   // saved first pass
  const [pinError,      setPinError]      = useState(false);
  const [pinShake,      setPinShake]      = useState(false);
  const [pinTarget,     setPinTarget]     = useState<'disable'|'change'|null>(null); // what verify leads to

  // Load biometric support when page 6 is active
  useEffect(() => {
    if (page === 6) {
      checkBiometricSupport().then(setBioSupport);
      setPinStatus(isPinEnabled());
      setBioEnabled(isBiometricEnabled());
      setPinTimeoutState(getPinTimeout());
    }
  }, [page]);

  // Auto-check PIN when 4 digits entered in overlay
  useEffect(() => {
    if (pinInput.length === 4) {
      handlePinDigitComplete(pinInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinInput]);

  const doShakeError = useCallback(() => {
    setPinError(true);
    setPinShake(true);
    setTimeout(() => {
      setPinShake(false);
      setPinError(false);
      setPinInput('');
    }, 700);
  }, []);

  async function handlePinDigitComplete(digits: string) {
    if (pinMode === 'set-1' || pinMode === 'change-1') {
      // Save first pass, move to confirm
      setPinFirst(digits);
      setPinInput('');
      setPinMode(pinMode === 'set-1' ? 'set-2' : 'change-2');
    } else if (pinMode === 'set-2' || pinMode === 'change-2') {
      // Confirm pass
      if (digits === pinFirst) {
        await enablePin(digits);
        setPinStatus(true);
        setPinMode('none');
        setPinInput('');
        setPinFirst('');
      } else {
        doShakeError();
      }
    } else if (pinMode === 'verify') {
      const ok = await verifyPin(digits);
      if (ok) {
        if (pinTarget === 'disable') {
          disablePin();
          disableBiometric();
          setPinStatus(false);
          setBioEnabled(false);
          setPinMode('none');
          setPinInput('');
        } else if (pinTarget === 'change') {
          setPinInput('');
          setPinMode('change-1');
        }
      } else {
        doShakeError();
      }
    }
  }

  function openPinEntry(mode: typeof pinMode, target?: typeof pinTarget) {
    setPinMode(mode);
    setPinInput('');
    setPinFirst('');
    setPinError(false);
    setPinShake(false);
    if (target !== undefined) setPinTarget(target);
  }

  async function handleBioToggle() {
    if (bioEnabled) {
      disableBiometric();
      setBioEnabled(false);
    } else {
      const ok = await registerBiometric();
      setBioEnabled(ok);
    }
  }

  function handleTimeoutChange(minutes: number) {
    setPinTimeout(minutes);
    setPinTimeoutState(minutes);
  }

  // back-navigation map
  const BACK: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 1, 5: 0, 6: 0, 7: 0, 8: 7 };
  function goBack() {
    if (pinMode !== 'none') { setPinMode('none'); setPinInput(''); return; }
    setPage(p => BACK[p] ?? 0);
  }

  function goLogin()        { setPage(1); }
  function goGoogleChoose() { setProvider('google'); setPage(2); }
  function goGooglePerms()  { setPage(3); }
  function goTerms(p: Provider) {
    setProvider(p);
    if (p === 'google') { goGoogleChoose(); return; }
    handleAgree();
  }

  function handleAgree() {
    let newUser: StoredUser;
    if (provider === 'google') {
      newUser = { name: MOCK_ACCOUNT.name, email: MOCK_ACCOUNT.email, initials: MOCK_ACCOUNT.initials, provider: 'google', joinedAt: new Date().toISOString(), accountType: 'free' };
    } else if (provider === 'email' && suEmail.trim()) {
      const initials = suEmail.trim().slice(0, 2).toUpperCase();
      newUser = { name: suEmail.trim(), email: suEmail.trim(), initials, provider: 'email', joinedAt: new Date().toISOString(), accountType: 'free' };
    } else {
      newUser = { name: 'PrivaScan User', email: '', initials: 'PS', provider: provider ?? 'email', joinedAt: new Date().toISOString(), accountType: 'free' };
    }
    saveUser(newUser);
    setUser(newUser);
    onClose();
    setLocation('/');
  }

  function handleAccountTypeChange(t: 'free' | 'member') {
    if (!user) return;
    const updated = { ...user, accountType: t };
    saveUser(updated);
    setUser(updated);
    setShowTypePicker(false);
  }

  function handleSignOut() {
    clearUser();
    setUser(null);
    setPage(0);
  }

  function handleMenu(action: MenuAction) {
    if (action === 'signin')        { user ? setPage(7) : goLogin(); return; }
    if (action === 'scan')          { onClose(); return; }
    if (action === 'help')          { window.open('mailto:support@privascan.app'); return; }
    if (action === 'about')         { setPage(5);             return; }
    if (action === 'pin')           { setPage(6);             return; }
    if (action === 'legal-privacy') { setLegalDoc('privacy'); return; }
    if (action === 'legal-terms')   { setLegalDoc('terms');   return; }
    if (action === 'legal-consent') { setLegalDoc('consent'); return; }
  }

  const TOTAL_PAGES = 9;
  const CARD_STYLE: React.CSSProperties = {
    width: '66vw', minWidth: 264, maxWidth: 396,
    height: 'min(78vh, 580px)',
    display: 'flex', flexDirection: 'column',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80]"
        style={{ background: 'rgba(0,0,0,0.55)' }}
        onClick={onClose}
      />

      {/* Card wrapper */}
      <div
        className="fixed z-[90] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-2xl overflow-hidden bg-white"
        style={CARD_STYLE}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Sliding track: 5 pages side by side ── */}
        <div
          className="flex flex-1 min-h-0"
          style={{
            width: `${TOTAL_PAGES * 100}%`,
            transform: `translateX(${-page * (100 / TOTAL_PAGES)}%)`,
            transition: 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >

          {/* ════ Page 0 — Main menu ════ */}
          <div className="flex flex-col h-full" style={{ width: `${100 / TOTAL_PAGES}%` }}>
            {/* ── Header: logo+name LEFT, avatar RIGHT ── */}
            <div className="flex items-center justify-between px-5 pt-7 pb-5 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <AppLogo size="w-11 h-11" />
                <div>
                  <p className="font-bold text-[18px] tracking-tight text-gray-900 leading-none">
                    Priva<span className="text-sky-400">Scan</span>
                  </p>
                  {!user && (
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                      Sign in to access more features
                    </p>
                  )}
                </div>
              </div>
              {user ? (
                <button
                  onClick={() => setPage(7)}
                  aria-label="View account"
                  className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shadow-md ring-2 ring-white hover:ring-blue-200 active:scale-95 transition-all shrink-0"
                >
                  <span className="text-[13px] font-bold text-white leading-none">{user.initials}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {SIGN_IN_METHODS.map(m => (
                    <button key={m.id} onClick={goLogin} className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center shadow-sm transition-opacity active:opacity-70',
                      m.id === 'google' ? 'bg-white border-2 border-gray-300' :
                      m.id === 'apple'  ? 'bg-black' : 'bg-emerald-500',
                    )}>
                      {m.iconEl}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Scrollable menu body ── */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* Section 1 */}
              {MAIN_ITEMS.map((item, i) => (
                <button key={i} onClick={() => handleMenu(item.action)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100">
                  <span className="text-gray-400 shrink-0">{item.icon}</span>
                  <span className="flex-1 text-left text-[13px] text-gray-700 font-medium">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </button>
              ))}

              {/* Divider */}
              <div className="h-2 bg-gray-50 border-y border-gray-100" />

              {/* Section 2 */}
              {MORE_ITEMS.map((item, i) => (
                <button key={i} onClick={() => handleMenu(item.action)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100">
                  <span className="text-gray-400 shrink-0">{item.icon}</span>
                  <span className="flex-1 text-left text-[13px] text-gray-700 font-medium">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </button>
              ))}

              {/* Divider */}
              <div className="h-2 bg-gray-50 border-y border-gray-100" />

              {/* Legal Entity section */}
              <div className="px-5 py-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Legal Entity</p>
              </div>
              {LEGAL_ITEMS.map((item, i) => (
                <button key={i} onClick={() => handleMenu(item.action)}
                  className="w-full flex items-center gap-3 pl-7 pr-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100 last:border-b-0">
                  <span className="text-gray-400 shrink-0">{item.icon}</span>
                  <span className="flex-1 text-left text-[12px] text-gray-600">{item.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                </button>
              ))}
            </div>

            {/* ── Version footer ── */}
            <p className="text-center text-gray-300 text-[10px] py-2.5 border-t border-gray-100 shrink-0">v{__APP_VERSION__}</p>
          </div>

          {/* ════ Page 1 — Login form ════ */}
          <div className="flex flex-col" style={{ width: `${100 / TOTAL_PAGES}%` }}>
            <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-gray-100">
              <button onClick={goBack} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <p className="font-semibold text-[15px] text-gray-900">Login</p>
            </div>

            <div className="px-5 pt-4 pb-5 flex flex-col gap-3">
              <p className="text-[11px] text-gray-400 leading-snug">
                Sign in to&nbsp;<span className="font-semibold text-gray-700">access more features</span>
              </p>

              {/* Provider icon row */}
              <div className="flex items-center gap-2 pb-1">
                {SIGN_IN_METHODS.map(m => (
                  <button key={m.id} onClick={() => goTerms(m.id)} className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center shadow-sm transition-opacity active:opacity-70 shrink-0',
                    m.id === 'google' ? 'bg-white border-2 border-gray-300' :
                    m.id === 'apple'  ? 'bg-black' : 'bg-emerald-500',
                  )}>
                    {m.iconEl}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">Email</label>
                <input type="email" placeholder="your@email.com" value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-3 py-2.5 pr-9 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end -mt-1">
                <button className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">Forgot your password?</button>
              </div>

              <button onClick={() => {/* TODO: email auth */}}
                className="w-full py-2.5 rounded-xl bg-[#1e3a5f] hover:bg-[#162d4a] text-white font-bold text-[13px] transition-colors shadow-sm">
                Sign In
              </button>

              <p className="text-center text-[11px] text-gray-400">
                Don't have an account?{' '}
                <button onClick={() => setPage(4)} className="text-blue-500 font-semibold hover:underline">Sign up</button>
              </p>
            </div>
          </div>

          {/* ════ Page 2 — Google: Choose an account ════ */}
          <div className="flex flex-col" style={{ width: `${100 / TOTAL_PAGES}%` }}>
            <GoogleUrlBar onClose={goBack} />

            {/* Google branding */}
            <div className="flex items-center gap-2 px-5 pt-4 pb-2">
              <GoogleIcon size="w-5 h-5" />
              <span className="text-[12px] text-gray-700 font-medium">Sign in with Google</span>
            </div>

            {/* App info */}
            <div className="flex items-center gap-2.5 px-5 py-3 border-b border-gray-100">
              <AppLogo size="w-9 h-9" />
              <div>
                <p className="text-[12px] font-bold text-gray-900 leading-none">
                  Priva<span className="text-sky-400">Scan</span>
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">Sign in to access more features</p>
              </div>
            </div>

            <div className="px-5 pt-4 pb-2">
              <p className="text-[15px] font-bold text-gray-900">Choose an account</p>
              <p className="text-[11px] text-gray-500 mt-0.5">to continue to <span className="font-semibold">PrivaScan</span></p>
            </div>

            {/* Mock account row */}
            <button
              onClick={goGooglePerms}
              className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100"
            >
              <Avatar initials={MOCK_ACCOUNT.initials} size="w-9 h-9" text="text-sm" />
              <div className="text-left">
                <p className="text-[13px] font-semibold text-gray-900">{MOCK_ACCOUNT.name}</p>
                <p className="text-[11px] text-gray-500">{MOCK_ACCOUNT.email}</p>
              </div>
            </button>

            {/* Use another account */}
            <button className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100">
              <div className="w-9 h-9 rounded-full border-2 border-gray-300 flex items-center justify-center shrink-0">
                <UserCircle2 className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-[13px] text-gray-700 font-medium">Use another account</p>
            </button>

          </div>

          {/* ════ Page 3 — Google: Permissions confirmation ════ */}
          <div className="flex flex-col" style={{ width: `${100 / TOTAL_PAGES}%` }}>
            <GoogleUrlBar onClose={goBack} />

            <div className="px-5 pt-4 pb-3 border-b border-gray-100">
              <p className="text-[15px] font-bold text-gray-900">Sign in to PrivaScan</p>

              {/* Selected email chip */}
              <div className="flex items-center gap-1.5 mt-3 px-2.5 py-1.5 rounded-full border border-gray-200 bg-gray-50 w-fit">
                <Avatar initials={MOCK_ACCOUNT.initials} size="w-5 h-5" text="text-[8px]" />
                <span className="text-[11px] text-gray-700">{MOCK_ACCOUNT.email}</span>
                <ChevronRight className="w-3 h-3 text-gray-400 rotate-90" />
              </div>
            </div>

            <div className="px-5 pt-3 pb-2">
              <p className="text-[11px] text-gray-700 font-semibold leading-snug">
                Google will allow PrivaScan to access this info about you
              </p>
            </div>

            {/* Permission items */}
            <div className="px-5 pb-3 flex flex-col gap-3">
              <div className="flex items-start gap-2.5">
                <UserCircle2 className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[12px] font-medium text-gray-800">{MOCK_ACCOUNT.name}</p>
                  <p className="text-[10px] text-gray-500">Name and profile picture</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Mail className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[12px] font-medium text-gray-800">{MOCK_ACCOUNT.email}</p>
                  <p className="text-[10px] text-gray-500">Email address</p>
                </div>
              </div>
            </div>

            {/* Single-checkbox consent row */}
            <div className="border-t border-gray-100 pt-3 px-5 pb-3">
              <button
                onClick={() => setPage3Checked(v => !v)}
                className="flex items-start gap-2.5 text-left w-full"
              >
                {/* checkbox */}
                <span className={cn(
                  'mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
                  page3Checked ? 'border-blue-500 bg-blue-500' : 'border-gray-400 bg-white',
                )}>
                  {page3Checked && (
                    <svg viewBox="0 0 12 10" className="w-2.5 h-2.5" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1.5,5 4.5,8 10.5,1.5" />
                    </svg>
                  )}
                </span>
                {/* text */}
                <span className="text-[10px] text-gray-600 leading-relaxed">
                  I'm at least 14 years old, and I agree to PrivaScan's{' '}
                  <span
                    className="text-blue-500 underline font-medium"
                    onClick={e => { e.stopPropagation(); setLegalDoc('terms'); }}
                  >Terms of Service</span>
                  {', '}
                  <span
                    className="text-blue-500 underline font-medium"
                    onClick={e => { e.stopPropagation(); setLegalDoc('privacy'); }}
                  >Privacy policy</span>
                  {', '}
                  <span
                    className="text-blue-500 underline font-medium"
                    onClick={e => { e.stopPropagation(); setLegalDoc('consent'); }}
                  >consent to collection of data</span>
                  .
                </span>
              </button>
            </div>

            {/* Cancel / Continue */}
            <div className="flex gap-2 px-5 pb-4">
              <button
                onClick={goBack}
                className="flex-1 py-2 rounded-full border border-gray-300 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!page3Checked}
                onClick={handleAgree}
                className={cn(
                  'flex-1 py-2 rounded-full text-[12px] font-semibold transition-colors',
                  page3Checked
                    ? 'border border-blue-500 text-blue-600 hover:bg-blue-50'
                    : 'border border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50',
                )}
              >
                Continue
              </button>
            </div>
          </div>

          {/* ════ Page 4 — Sign Up ════ */}
          <div className="flex flex-col" style={{ width: `${100 / TOTAL_PAGES}%` }}>
            <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-gray-100">
              <button onClick={goBack} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <p className="font-semibold text-[15px] text-gray-900">Create account</p>
            </div>

            <div className="flex flex-col gap-3 px-5 py-4">
              {/* Email */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="jane@example.com"
                  value={suEmail}
                  onChange={e => setSuEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showSuPassword ? 'text' : 'password'}
                    placeholder="Min. 8 characters"
                    value={suPassword}
                    onChange={e => setSuPassword(e.target.value)}
                    className="w-full px-3 py-2.5 pr-9 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button type="button" onClick={() => setShowSuPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showSuPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Consent checkbox */}
              <button
                onClick={() => setSuChecked(v => !v)}
                className="flex items-start gap-2 text-left mt-1"
              >
                <span className={cn(
                  'mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
                  suChecked ? 'border-blue-500 bg-blue-500' : 'border-gray-300 bg-white',
                )}>
                  {suChecked && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </span>
                <span className="text-[11px] text-gray-600 leading-snug">
                  I'm at least 14 years old and I agree to PrivaScan's{' '}
                  <span className="text-blue-500 underline" onClick={e => { e.stopPropagation(); setLegalDoc('terms'); }}>Terms of Service</span>
                  {' '}and{' '}
                  <span className="text-blue-500 underline" onClick={e => { e.stopPropagation(); setLegalDoc('privacy'); }}>Privacy Policy</span>.
                </span>
              </button>

              {/* Create Account button */}
              <button
                disabled={!suEmail.trim() || suPassword.length < 8 || !suChecked}
                onClick={() => {/* TODO: email sign-up */ handleAgree(); }}
                className={cn(
                  'w-full py-2.5 rounded-xl text-[13px] font-semibold transition-colors shadow-sm mt-1',
                  suEmail.trim() && suPassword.length >= 8 && suChecked
                    ? 'bg-[#1e3a5f] hover:bg-[#162d4a] text-white'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed',
                )}
              >
                Create Account
              </button>

              <p className="text-center text-[11px] text-gray-400">
                Already have an account?{' '}
                <button onClick={() => setPage(1)} className="text-blue-500 font-semibold hover:underline">Sign in</button>
              </p>
            </div>
          </div>

          {/* ════ Page 5 — About PrivaScan ════ */}
          <div className="flex flex-col h-full" style={{ width: `${100 / TOTAL_PAGES}%` }}>
            {/* Header */}
            <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <button onClick={goBack} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <p className="font-semibold text-[15px] text-gray-900">About PrivaScan</p>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto min-h-0">

              {/* Logo + name */}
              <div className="flex flex-col items-center pt-6 pb-4 px-5">
                <AppLogo size="w-16 h-16" />
                <p className="mt-3 font-bold text-[20px] tracking-tight text-gray-900">
                  Priva<span className="text-sky-400">Scan</span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">Document Scanner · v{__APP_VERSION__}</p>
              </div>

              {/* Privacy slogan banner */}
              <div className="mx-5 mb-5 rounded-2xl overflow-hidden">
                <div className="bg-gradient-to-br from-sky-500 to-blue-700 px-4 py-5">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Shield className="w-3.5 h-3.5 text-sky-200" />
                    <span className="text-[9px] font-bold tracking-widest text-sky-200 uppercase">Privacy First</span>
                  </div>
                  <p className="text-white font-bold text-[16px] leading-snug">
                    Your scanned documents exist only on{' '}
                    <span className="text-yellow-300">your device</span>
                    {' '}and{' '}
                    <span className="text-yellow-300">your personal cloud</span>
                    {' '}—{' '}
                    <span className="text-sky-200">never on our servers.</span>
                  </p>
                </div>
              </div>

              {/* Feature list */}
              {[
                {
                  icon: <Smartphone className="w-4 h-4 text-blue-500" />,
                  bg: 'bg-blue-50',
                  title: '100% On-Device Processing',
                  desc: 'Every scan is processed locally on your phone. No data ever leaves your device during capture.',
                },
                {
                  icon: <Server className="w-4 h-4 text-red-400" />,
                  bg: 'bg-red-50',
                  title: 'Zero Cloud Server',
                  desc: 'We operate no servers that store your documents — not even temporarily. Completely serverless.',
                },
                {
                  icon: <Zap className="w-4 h-4 text-amber-500" />,
                  bg: 'bg-amber-50',
                  title: 'Offline-First',
                  desc: 'Scan, process, and export without an internet connection. Full functionality, always.',
                },
                {
                  icon: <Cloud className="w-4 h-4 text-sky-500" />,
                  bg: 'bg-sky-50',
                  title: 'Your Cloud, Your Rules',
                  desc: 'Export to iCloud, Google Drive, or Dropbox on your terms — we never touch your cloud credentials.',
                },
                {
                  icon: <CheckCircle2 className="w-4 h-4 text-green-500" />,
                  bg: 'bg-green-50',
                  title: 'PDF & JPEG Export',
                  desc: 'High-quality output compatible with all devices, apps, and document workflows.',
                },
              ].map((f, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-3 border-b border-gray-50">
                  <div className={`w-8 h-8 rounded-xl ${f.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    {f.icon}
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-gray-800">{f.title}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{f.desc}</p>
                  </div>
                </div>
              ))}

              {/* Company info */}
              <div className="px-5 py-4 text-center space-y-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Developed by</p>
                <p className="text-[12px] font-bold text-gray-700">CLASSIC LEGEND</p>
                <p className="text-[11px] text-gray-400">support@privascan.app</p>
                <p className="text-[10px] text-gray-300 mt-2">© 2024 CLASSIC LEGEND. All rights reserved.</p>
              </div>

            </div>
          </div>

          {/* ════ Page 6 — App PIN Settings ════ */}
          <div className="flex flex-col h-full" style={{ width: `${100 / TOTAL_PAGES}%` }}>
            {/* Header */}
            <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <button onClick={goBack} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <div className="flex-1 flex items-center gap-2">
                <p className="font-semibold text-[15px] text-gray-900">App PIN</p>
                {pinStatus && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">
                    <CheckCircle className="w-3 h-3" />
                    ON
                  </span>
                )}
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto min-h-0">

              {/* Info banner */}
              <div className="mx-5 mt-4 mb-3 rounded-xl bg-sky-50 border border-sky-100 px-4 py-3 flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-sky-700 leading-snug">
                  Protect PrivaScan with a 4-digit PIN. Even if someone picks up your unlocked phone, your scanned documents stay private.
                </p>
              </div>

              {!pinStatus ? (
                /* ── PIN not enabled ── */
                <div className="flex flex-col items-center px-5 py-6 gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <Lock className="w-8 h-8 text-gray-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-[14px] font-bold text-gray-800">No PIN set</p>
                    <p className="text-[11px] text-gray-400 mt-1">Set a 4-digit PIN to lock the app</p>
                  </div>
                  <button
                    onClick={() => openPinEntry('set-1')}
                    className="w-full py-3 rounded-xl bg-[#1e3a5f] hover:bg-[#162d4a] text-white font-bold text-[13px] transition-colors shadow-sm"
                  >
                    Enable App PIN
                  </button>
                </div>
              ) : (
                /* ── PIN enabled ── */
                <div className="flex flex-col">

                  {/* Auto-lock timing */}
                  <div className="px-5 pt-4 pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <p className="text-[12px] font-semibold text-gray-700">Auto-Lock</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {TIMEOUT_OPTIONS.map(opt => (
                        <button
                          key={opt.minutes}
                          onClick={() => handleTimeoutChange(opt.minutes)}
                          className={cn(
                            'px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors',
                            pinTimeout === opt.minutes
                              ? 'bg-[#1e3a5f] text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Biometric toggle */}
                  {bioSupport && (
                    <button
                      onClick={handleBioToggle}
                      className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition-colors w-full text-left"
                    >
                      <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 24 24" className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M2 8V5a2 2 0 0 1 2-2h3"/><path d="M17 3h3a2 2 0 0 1 2 2v3"/>
                          <path d="M22 16v3a2 2 0 0 1-2 2h-3"/><path d="M7 21H4a2 2 0 0 1-2-2v-3"/>
                          <path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M9.5 15a3.5 3.5 0 0 0 5 0"/>
                          <path d="M12 7v3"/>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-[12px] font-semibold text-gray-800">Face ID / Touch ID</p>
                        <p className="text-[10px] text-gray-400">Use biometrics to unlock</p>
                      </div>
                      {bioEnabled
                        ? <ToggleRight className="w-6 h-6 text-[#1e3a5f] shrink-0" />
                        : <ToggleLeft  className="w-6 h-6 text-gray-300 shrink-0" />
                      }
                    </button>
                  )}

                  {/* Change PIN */}
                  <button
                    onClick={() => openPinEntry('verify', 'change')}
                    className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition-colors w-full text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <Lock className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[12px] font-semibold text-gray-800">Change PIN</p>
                      <p className="text-[10px] text-gray-400">Set a new 4-digit PIN</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </button>

                  {/* Disable PIN */}
                  <button
                    onClick={() => openPinEntry('verify', 'disable')}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-red-50 transition-colors w-full text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                      <X className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[12px] font-semibold text-red-500">Disable PIN</p>
                      <p className="text-[10px] text-gray-400">Remove app lock</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-red-200 shrink-0" />
                  </button>

                </div>
              )}
            </div>
          </div>

          {/* ════ Page 7 — Account ════ */}
          <div className="flex flex-col h-full" style={{ width: `${100 / TOTAL_PAGES}%` }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-7 pb-5 shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={goBack} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0">
                  <ChevronLeft className="w-4 h-4 text-gray-500" />
                </button>
                <p className="font-bold text-[20px] text-gray-900">Account</p>
              </div>
              {user && (
                <div className="w-11 h-11 rounded-full bg-blue-600 flex items-center justify-center shadow-md shrink-0">
                  <span className="text-[14px] font-bold text-white leading-none">{user.initials}</span>
                </div>
              )}
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-y-auto min-h-0 px-5 flex flex-col">

              {/* Account Detail */}
              <button
                onClick={() => setPage(8)}
                className="flex items-center justify-between py-4 border-b border-gray-100 -mx-1 px-1 rounded-xl hover:bg-sky-50 transition-colors w-full text-left"
              >
                <span className="text-[15px] text-gray-500 font-medium">Account Detail</span>
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-[13px] text-gray-800 font-medium truncate max-w-[48%]">
                    {user?.email ? maskEmail(user.email) : '—'}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                </div>
              </button>

              {/* Account Type */}
              <button
                onClick={() => setShowTypePicker(true)}
                className="flex items-center justify-between py-4 border-b border-gray-100 -mx-1 px-1 rounded-xl hover:bg-sky-50 transition-colors w-full text-left"
              >
                <span className="text-[15px] text-gray-500 font-medium">Account Type</span>
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    'text-[13px] font-semibold',
                    (user?.accountType ?? 'free') === 'member' ? 'text-blue-600' : 'text-gray-500',
                  )}>
                    {(user?.accountType ?? 'free') === 'member' ? 'Member' : 'Free'}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                </div>
              </button>

              {/* Notification */}
              <div
                onClick={() => setNotifEnabled(v => !v)}
                className="flex items-center justify-between py-4 border-b border-gray-100 -mx-1 px-1 rounded-xl hover:bg-sky-50 transition-colors cursor-pointer"
              >
                <span className="text-[15px] text-gray-500 font-medium">Notification</span>
                {/* iOS-style toggle */}
                <div
                  className={cn(
                    'relative flex-none w-[51px] h-[31px] rounded-full transition-colors duration-300',
                    notifEnabled ? 'bg-[#34C759]' : 'bg-[#D1D1D6]',
                  )}
                  style={{ boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.08)' }}
                >
                  <span
                    className={cn(
                      'absolute top-[2px] w-[27px] h-[27px] rounded-full bg-white transition-transform duration-300',
                      notifEnabled ? 'translate-x-[20px]' : 'translate-x-[2px]',
                    )}
                    style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.22)' }}
                  />
                </div>
              </div>

              {/* Subscription */}
              <button className="flex items-center justify-between py-4 border-b border-gray-100 w-full text-left -mx-1 px-1 rounded-xl hover:bg-sky-50 transition-colors">
                <span className="text-[15px] text-gray-500 font-medium">Subscription</span>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>

              {/* Sign Out */}
              <button
                onClick={handleSignOut}
                className="flex items-center justify-between py-4 w-full text-left -mx-1 px-1 rounded-xl hover:bg-red-50 transition-colors"
              >
                <span className="text-[15px] text-gray-500 font-medium hover:text-red-500 transition-colors">Sign Out</span>
              </button>

            </div>
          </div>

          {/* ════ Page 8 — Account Detail ════ */}
          <div className="flex flex-col h-full" style={{ width: `${100 / TOTAL_PAGES}%` }}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 pt-6 pb-4 border-b border-gray-100 shrink-0">
              <button onClick={goBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0">
                <ChevronLeft className="w-5 h-5 text-gray-500" />
              </button>
              <p className="font-semibold text-[17px] text-gray-900 flex-1 text-center pr-8">Account Name</p>
            </div>

            {/* Link rows */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* By SMS */}
              <button className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left">
                <span className="text-[15px] text-gray-800">By SMS</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] text-gray-400">Add</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </div>
              </button>

              {/* Email */}
              <button className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left">
                <span className="text-[15px] text-gray-800">Email</span>
                <div className="flex items-center gap-1.5">
                  {user?.provider === 'email' && user.email ? (
                    <span className="text-[14px] text-gray-500">{maskEmail(user.email)}</span>
                  ) : (
                    <span className="text-[14px] text-gray-400">Add</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </div>
              </button>

              {/* Apple ID */}
              <button className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left">
                <span className="text-[15px] text-gray-800">Apple ID</span>
                <div className="flex items-center gap-1.5">
                  {user?.provider === 'apple' ? (
                    <span className="text-[14px] text-gray-500">Remove</span>
                  ) : (
                    <span className="text-[14px] text-gray-400">Add</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </div>
              </button>

              {/* Google Account */}
              <button className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left">
                <span className="text-[15px] text-gray-800">Google Account</span>
                <div className="flex items-center gap-1.5">
                  {user?.provider === 'google' ? (
                    <span className="text-[14px] text-gray-500">Remove</span>
                  ) : (
                    <span className="text-[14px] text-gray-400">Add</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </div>
              </button>

              {/* Divider */}
              <div className="h-2.5 bg-gray-50 border-y border-gray-100 my-1" />

              {/* Delete Account */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-red-50 transition-colors text-left group"
              >
                <div className="flex-1 pr-3">
                  <p className="text-[15px] text-gray-800 group-hover:text-red-600 transition-colors">Delete Account</p>
                  <p className="text-[12px] text-gray-400 mt-0.5 leading-snug">
                    Deleting your account is irreversible. Please proceed with caution.
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            </div>
          </div>

        </div>{/* /sliding track */}

        {/* ════ Delete Account confirmation ════ */}
        {showDeleteConfirm && (
          <>
            <div
              className="absolute inset-0 z-20"
              style={{ background: 'rgba(0,0,0,0.35)' }}
              onClick={() => setShowDeleteConfirm(false)}
            />
            <div
              className="absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-2xl"
              style={{ animation: 'slideUpIn 0.22s ease' }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>
              {/* Warning icon */}
              <div className="flex flex-col items-center px-6 pt-4 pb-3 text-center">
                <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-3">
                  <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <p className="text-[16px] font-bold text-gray-900 mb-1">Delete Account?</p>
                <p className="text-[12px] text-gray-500 leading-relaxed">
                  This action is permanent and cannot be undone.{'\n'}All your data will be deleted.
                </p>
              </div>
              <div className="px-5 pb-6 pt-2 flex flex-col gap-2.5">
                <button
                  onClick={() => { setShowDeleteConfirm(false); handleSignOut(); }}
                  className="w-full py-3.5 rounded-xl bg-red-500 text-white text-[14px] font-bold hover:bg-red-600 transition-colors active:scale-[0.98]"
                >
                  Delete My Account
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full py-3.5 rounded-xl bg-gray-100 text-gray-700 text-[14px] font-semibold hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}

        {/* ════ PIN entry overlay (inside card) ════ */}
        {pinMode !== 'none' && (() => {
          const titleMap: Record<typeof pinMode, string> = {
            'none':     '',
            'set-1':    'Set PIN',
            'set-2':    'Confirm PIN',
            'verify':   'Enter current PIN',
            'change-1': 'New PIN',
            'change-2': 'Confirm new PIN',
          };
          const PIN_KEYPAD = ['1','2','3','4','5','6','7','8','9','','0','⌫'] as const;
          return (
            <div className="absolute inset-0 bg-white z-20 flex flex-col" style={{ animation: 'slideUpIn 0.25s ease' }}>
              {/* Header */}
              <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
                <button
                  onClick={() => { setPinMode('none'); setPinInput(''); setPinFirst(''); }}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-500" />
                </button>
                <p className="font-semibold text-[15px] text-gray-900">{titleMap[pinMode]}</p>
              </div>

              {/* Dots + keypad */}
              <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 pb-6">
                <p className="text-[12px] text-gray-400 text-center">
                  {pinMode === 'set-1' || pinMode === 'change-1' ? 'Enter a 4-digit PIN'
                   : pinMode === 'set-2' || pinMode === 'change-2' ? 'Re-enter the same PIN to confirm'
                   : 'Enter your current PIN to continue'}
                </p>

                {/* 4 dots */}
                <div className={cn('flex gap-4', pinShake && 'animate-[pinShake_0.5s_ease-in-out]')}>
                  {[0,1,2,3].map(i => (
                    <span key={i} className={cn(
                      'w-3.5 h-3.5 rounded-full border-2 transition-all duration-150',
                      i < pinInput.length
                        ? pinError ? 'border-red-500 bg-red-500' : 'border-[#1e3a5f] bg-[#1e3a5f]'
                        : 'border-gray-300',
                    )} />
                  ))}
                </div>
                {pinError && <p className="text-[11px] text-red-500 -mt-3">
                  {pinMode === 'verify' ? 'Incorrect PIN' : 'PINs don\'t match — try again'}
                </p>}

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-2.5 w-full max-w-[220px]">
                  {PIN_KEYPAD.map((k, i) => {
                    if (k === '') return <div key={i} />;
                    const isBack = k === '⌫';
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          if (isBack) { setPinInput(p => p.slice(0, -1)); }
                          else if (pinInput.length < 4) { setPinInput(p => p + k); }
                        }}
                        className={cn(
                          'h-12 rounded-xl text-[18px] font-semibold flex items-center justify-center transition-all active:scale-95',
                          isBack
                            ? 'text-gray-500 bg-transparent hover:bg-gray-100'
                            : 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300',
                        )}
                      >
                        {isBack ? <Delete className="w-4 h-4" /> : k}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ════ Account Type picker sheet ════ */}
        {showTypePicker && (
          <>
            {/* dim backdrop inside card */}
            <div
              className="absolute inset-0 z-20"
              style={{ background: 'rgba(0,0,0,0.25)' }}
              onClick={() => setShowTypePicker(false)}
            />
            {/* bottom sheet */}
            <div
              className="absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-2xl pb-2"
              style={{ animation: 'slideUpIn 0.22s ease' }}
            >
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>
              <p className="text-[12px] font-semibold text-gray-400 text-center pt-1 pb-2 uppercase tracking-wider">
                Account Type
              </p>

              {(['free', 'member'] as const).map(t => {
                const active = (user?.accountType ?? 'free') === t;
                return (
                  <button
                    key={t}
                    onClick={() => handleAccountTypeChange(t)}
                    className={cn(
                      'w-full flex items-center justify-between px-5 py-4 transition-colors',
                      active ? 'bg-sky-50' : 'hover:bg-gray-50',
                    )}
                  >
                    <div className="text-left">
                      <p className={cn('text-[15px] font-semibold', active ? 'text-blue-600' : 'text-gray-800')}>
                        {t === 'free' ? 'Free' : 'Member'}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {t === 'free' ? 'Basic features, no subscription' : 'Full access with active subscription'}
                      </p>
                    </div>
                    {active && (
                      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}

              <div className="px-5 pt-2 pb-4">
                <button
                  onClick={() => setShowTypePicker(false)}
                  className="w-full py-3 rounded-xl bg-gray-100 text-[13px] font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}

        {/* ════ Legal document overlay ════ */}
        {legalDoc && (() => {
          const doc = LEGAL_DOCS[legalDoc];
          return (
            <div
              className="absolute inset-0 bg-white z-10 flex flex-col"
              style={{ animation: 'slideUpIn 0.25s ease' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
                <p className="font-bold text-[14px] text-gray-900">{doc.title}</p>
                <button
                  onClick={() => setLegalDoc(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-4">
                {doc.sections.map((s, i) => (
                  <div key={i}>
                    <p className="text-[11px] font-bold text-gray-800 mb-1">{s.heading}</p>
                    <p className="text-[10px] text-gray-600 leading-relaxed">{s.body}</p>
                  </div>
                ))}
              </div>

              {/* Close button at bottom */}
              <div className="px-5 pb-4 pt-2 shrink-0 border-t border-gray-100">
                <button
                  onClick={() => setLegalDoc(null)}
                  className="w-full py-2.5 rounded-xl border border-gray-300 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          );
        })()}

      </div>

      <style>{`
        @keyframes slideUpIn {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

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
import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  User, RefreshCw, ScanLine, FileText,
  Settings, HelpCircle, ChevronRight, ChevronLeft, Eye, EyeOff, X,
  UserCircle2, Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props { onClose: () => void }

type Provider = 'google' | 'apple' | 'phone' | 'email';

/* ── static data ─────────────────────────────────────────────────────────── */
const MENU_ITEMS = [
  { icon: <User      className="w-4 h-4" />, label: 'Account',           action: 'signin' as const },
  { icon: <RefreshCw className="w-4 h-4" />, label: 'Sync',              action: null },
  { icon: <ScanLine  className="w-4 h-4" />, label: 'Scan',              action: 'scan'   as const },
  { icon: <FileText  className="w-4 h-4" />, label: 'Document Settings', action: null },
];
const BOTTOM_ITEMS = [
  { icon: <Settings   className="w-4 h-4" />, label: 'Settings', action: null },
  { icon: <HelpCircle className="w-4 h-4" />, label: 'Help',     action: 'help' as const },
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
    iconEl: <svg viewBox="0 0 814 1000" className="w-5 h-5 shrink-0" fill="white"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.3-161.8-109.3-100.9-193.7-100.9-288.5c0-167.8 109.3-256.6 216.7-256.6 69.4 0 127.3 45.4 170.8 45.4 41.3 0 106.2-48 187.7-48C643.3 192.3 740.7 230.8 788.1 340.9zm-130.2-89.5c0-71.5 69.3-131.5 69.3-132.9 0-.6-.7-.6-1.3-.6-65.9 0-156.6 73.3-156.6 158.2 0 69.4 56.9 128.4 126.3 128.4 0 0 1.3 0 1.3-.6.1-1.4-38.9-81.6-39-153.5z"/></svg>,
  },
  {
    id: 'phone', label: 'Continue with Phone Number',
    bg: 'bg-blue-500 hover:bg-blue-600',
    iconEl: <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  },
  {
    id: 'email', label: 'Continue with Email',
    bg: 'bg-emerald-500 hover:bg-emerald-600',
    iconEl: <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
  },
];

const TERMS_ITEMS = [
  { id: 'age',     label: "I'm at least 14 years old" },
  { id: 'terms',   label: "I agree to PrivaScan's Terms of Service" },
  { id: 'privacy', label: "I agree to PrivaScan's Privacy Policy" },
  { id: 'data',    label: "I agree to PrivaScan's Consent to collection of data" },
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
        body: 'PrivaScan offers a subscription at €0.99/month (or the local currency equivalent). Subscriptions auto-renew unless cancelled at least 24 hours before the renewal date through your App Store or Google Play account settings. You are also responsible for any applicable taxes, VAT, mobile carrier fees, or other third-party charges associated with your purchase.',
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
        heading: '13. Governing Law',
        body: 'If you reside in the European Economic Area (EEA) or United Kingdom, these Terms are governed by the laws of Ireland. If you reside outside the EEA and UK, these Terms are governed by the laws of the State of California, USA, without regard to conflict of law principles. Disputes will be resolved by the courts of the applicable jurisdiction.',
      },
      {
        heading: '14. Contact',
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

/* ── Main ─────────────────────────────────────────────────────────────────── */
export function HomePopup({ onClose }: Props) {
  const [, setLocation] = useLocation();

  // 0 main | 1 login | 2 google-choose | 3 google-perms | 4 terms
  const [page,         setPage]         = useState(0);
  const [provider,     setProvider]     = useState<Provider | null>(null);
  const [checked,      setChecked]      = useState<Record<string, boolean>>({});
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Page 3 single-checkbox consent
  const [page3Checked, setPage3Checked] = useState(false);
  // Legal doc overlay: null = hidden, key = which doc to show
  const [legalDoc, setLegalDoc]         = useState<LegalDocKey | null>(null);

  // back-navigation map: which page to return to from each page
  const BACK: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 1 };
  function goBack() { setPage(p => BACK[p] ?? 0); }

  function goLogin()        { setPage(1); }
  function goGoogleChoose() { setProvider('google'); setPage(2); }
  function goGooglePerms()  { setPage(3); }
  function goTerms(p: Provider) {
    setProvider(p);
    if (p === 'google') { goGoogleChoose(); return; }
    setPage(4);
  }

  function handleAgree() {
    onClose();
    setLocation('/');
  }

  function handleMenu(action: 'signin' | 'scan' | 'help' | null) {
    if (action === 'signin') { goLogin(); return; }
    if (action === 'scan')   { onClose(); return; }
    if (action === 'help')   { window.open('mailto:support@privascan.app'); return; }
  }

  const allChecked = TERMS_ITEMS.every(i => checked[i.id]);

  /* 5 pages → 500% track, each panel 20% */
  const TOTAL_PAGES = 5;
  const CARD_STYLE: React.CSSProperties = { width: '60vw', minWidth: 220, maxWidth: 360 };

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
          className="flex"
          style={{
            width: `${TOTAL_PAGES * 100}%`,
            transform: `translateX(${-page * (100 / TOTAL_PAGES)}%)`,
            transition: 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >

          {/* ════ Page 0 — Main menu ════ */}
          <div className="flex flex-col" style={{ width: `${100 / TOTAL_PAGES}%` }}>
            <div className="flex flex-col items-center pt-7 pb-5 px-3 border-b border-gray-100">
              <div className="flex items-center gap-3 mb-1">
                <AppLogo />
                <div>
                  <p className="font-bold text-[18px] tracking-tight text-gray-900 leading-none">
                    Priva<span className="text-sky-400">Scan</span>
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1 leading-tight">
                    Sign in to access<br />more features
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 mt-3">
                {SIGN_IN_METHODS.map(m => (
                  <button key={m.id} onClick={goLogin} className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center shadow-sm transition-opacity active:opacity-70',
                    m.id === 'google' ? 'bg-white border-2 border-gray-300' :
                    m.id === 'apple'  ? 'bg-black' :
                    m.id === 'phone'  ? 'bg-blue-500' : 'bg-emerald-500',
                  )}>
                    {m.iconEl}
                  </button>
                ))}
              </div>
            </div>

            {MENU_ITEMS.map((item, i) => (
              <button key={i} onClick={() => handleMenu(item.action)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100">
                <span className="text-gray-400 shrink-0">{item.icon}</span>
                <span className="flex-1 text-left text-[13px] text-gray-700 font-medium">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            ))}

            <div className="h-2 bg-gray-50 border-y border-gray-100" />

            {BOTTOM_ITEMS.map((item, i) => (
              <button key={i} onClick={() => handleMenu(item.action)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100 last:border-b-0">
                <span className="text-gray-400 shrink-0">{item.icon}</span>
                <span className="flex-1 text-left text-[13px] text-gray-700 font-medium">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            ))}

            <p className="text-center text-gray-300 text-[10px] py-3">v1.0.0</p>
          </div>

          {/* ════ Page 1 — Login form ════ */}
          <div className="flex flex-col" style={{ width: `${100 / TOTAL_PAGES}%` }}>
            <div className="flex items-center gap-2 px-4 pt-5 pb-3 border-b border-gray-100">
              <button onClick={goBack} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <p className="font-semibold text-[15px] text-gray-900">Login</p>
            </div>

            <div className="px-4 pt-4 pb-5 flex flex-col gap-3">
              <p className="text-[11px] text-gray-400 leading-snug">
                Sign in to&nbsp;<span className="font-semibold text-gray-700">access more features</span>
              </p>

              {/* Provider icon row */}
              <div className="flex items-center gap-2 pb-1">
                {SIGN_IN_METHODS.map(m => (
                  <button key={m.id} onClick={() => goTerms(m.id)} className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center shadow-sm transition-opacity active:opacity-70 shrink-0',
                    m.id === 'google' ? 'bg-white border-2 border-gray-300' :
                    m.id === 'apple'  ? 'bg-black' :
                    m.id === 'phone'  ? 'bg-blue-500' : 'bg-emerald-500',
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
                <button className="text-blue-500 font-semibold hover:underline">Sign up</button>
              </p>
            </div>
          </div>

          {/* ════ Page 2 — Google: Choose an account ════ */}
          <div className="flex flex-col" style={{ width: `${100 / TOTAL_PAGES}%` }}>
            <GoogleUrlBar onClose={goBack} />

            {/* Google branding */}
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <GoogleIcon size="w-5 h-5" />
              <span className="text-[12px] text-gray-700 font-medium">Sign in with Google</span>
            </div>

            {/* App info */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
              <AppLogo size="w-9 h-9" />
              <div>
                <p className="text-[12px] font-bold text-gray-900 leading-none">
                  Priva<span className="text-sky-400">Scan</span>
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">Sign in to access more features</p>
              </div>
            </div>

            <div className="px-4 pt-4 pb-2">
              <p className="text-[15px] font-bold text-gray-900">Choose an account</p>
              <p className="text-[11px] text-gray-500 mt-0.5">to continue to <span className="font-semibold">PrivaScan</span></p>
            </div>

            {/* Mock account row */}
            <button
              onClick={goGooglePerms}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100"
            >
              <Avatar initials={MOCK_ACCOUNT.initials} size="w-9 h-9" text="text-sm" />
              <div className="text-left">
                <p className="text-[13px] font-semibold text-gray-900">{MOCK_ACCOUNT.name}</p>
                <p className="text-[11px] text-gray-500">{MOCK_ACCOUNT.email}</p>
              </div>
            </button>

            {/* Use another account */}
            <button className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100">
              <div className="w-9 h-9 rounded-full border-2 border-gray-300 flex items-center justify-center shrink-0">
                <UserCircle2 className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-[13px] text-gray-700 font-medium">Use another account</p>
            </button>

          </div>

          {/* ════ Page 3 — Google: Permissions confirmation ════ */}
          <div className="flex flex-col" style={{ width: `${100 / TOTAL_PAGES}%` }}>
            <GoogleUrlBar onClose={goBack} />

            <div className="px-4 pt-4 pb-3 border-b border-gray-100">
              <p className="text-[15px] font-bold text-gray-900">Sign in to PrivaScan</p>

              {/* Selected email chip */}
              <div className="flex items-center gap-1.5 mt-3 px-2.5 py-1.5 rounded-full border border-gray-200 bg-gray-50 w-fit">
                <Avatar initials={MOCK_ACCOUNT.initials} size="w-5 h-5" text="text-[8px]" />
                <span className="text-[11px] text-gray-700">{MOCK_ACCOUNT.email}</span>
                <ChevronRight className="w-3 h-3 text-gray-400 rotate-90" />
              </div>
            </div>

            <div className="px-4 pt-3 pb-2">
              <p className="text-[11px] text-gray-700 font-semibold leading-snug">
                Google will allow PrivaScan to access this info about you
              </p>
            </div>

            {/* Permission items */}
            <div className="px-4 pb-3 flex flex-col gap-3">
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
            <div className="border-t border-gray-100 pt-3 px-4 pb-3">
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
            <div className="flex gap-2 px-4 pb-4">
              <button
                onClick={goBack}
                className="flex-1 py-2 rounded-full border border-gray-300 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!page3Checked}
                onClick={() => setPage(4)}
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

          {/* ════ Page 4 — Terms agreement ════ */}
          <div className="flex flex-col" style={{ width: `${100 / TOTAL_PAGES}%` }}>
            <div className="flex items-center gap-2 px-4 pt-5 pb-3 border-b border-gray-100">
              <button onClick={goBack} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <p className="font-semibold text-[15px] text-gray-900">Accept terms</p>
            </div>

            <p className="text-[11px] text-gray-500 text-center px-4 pt-4 pb-2 leading-snug">
              I'm at least 14 years old, I agree to PrivaScan's{' '}
              <span className="text-emerald-600 underline">Terms of Service</span>,{' '}
              <span className="text-emerald-600 underline">Privacy Policy</span>,{' '}
              Consent to collection of data
            </p>

            <div className="flex flex-col gap-3 px-4 py-3">
              {TERMS_ITEMS.map(item => (
                <button
                  key={item.id}
                  onClick={() => setChecked(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                  className="flex items-start gap-2.5 text-left"
                >
                  <span className={cn(
                    'mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 transition-colors',
                    checked[item.id] ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300 bg-white',
                  )} />
                  <span className="text-[12px] text-gray-700 leading-snug">{item.label}</span>
                </button>
              ))}
            </div>

            <div className="px-4 pb-5 pt-2 flex flex-col gap-2">
              <button
                disabled={!allChecked}
                onClick={handleAgree}
                className={cn(
                  'w-full py-3 rounded-xl text-[13px] font-semibold transition-colors',
                  allChecked
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed',
                )}
              >
                Agree and continue
              </button>
              <button
                onClick={goBack}
                className="w-full py-2.5 rounded-xl text-[13px] font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

        </div>{/* /sliding track */}

        {/* ════ Legal document overlay ════ */}
        {legalDoc && (() => {
          const doc = LEGAL_DOCS[legalDoc];
          return (
            <div
              className="absolute inset-0 bg-white z-10 flex flex-col"
              style={{ animation: 'slideUpIn 0.25s ease' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
                <p className="font-bold text-[14px] text-gray-900">{doc.title}</p>
                <button
                  onClick={() => setLegalDoc(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
                {doc.sections.map((s, i) => (
                  <div key={i}>
                    <p className="text-[11px] font-bold text-gray-800 mb-1">{s.heading}</p>
                    <p className="text-[10px] text-gray-600 leading-relaxed">{s.body}</p>
                  </div>
                ))}
              </div>

              {/* Close button at bottom */}
              <div className="px-4 pb-4 pt-2 shrink-0 border-t border-gray-100">
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

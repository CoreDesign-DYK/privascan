/**
 * privacy-policy.tsx — PrivaScan Privacy Policy
 * Dark theme, in-app page
 */
import { useLocation } from 'wouter';
import { ChevronLeft } from 'lucide-react';

const LAST_UPDATED = 'August 14, 2026';

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-white font-semibold text-base mt-7 mb-2">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-white/55 text-sm leading-relaxed">{children}</p>;
}
function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-white/55 text-sm leading-relaxed flex gap-2">
      <span className="text-white/25 mt-0.5 shrink-0">·</span>
      <span>{children}</span>
    </li>
  );
}

export default function PrivacyPolicyScreen() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: '#0d0d14' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-14 pb-4 border-b border-white/8">
        <button
          onClick={() => setLocation('/home')}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:bg-white/10 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-white font-semibold text-base">Privacy Policy</h1>
          <p className="text-white/30 text-xs">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-16">

        <H2>1. Overview</H2>
        <P>
          PrivaScan ("we", "our", "the app") is committed to protecting your privacy.
          This policy explains what data is processed when you use PrivaScan and how it is handled.
          PrivaScan is designed as a privacy-first application: your documents are never sent to
          any external server.
        </P>

        <H2>2. Data We Process</H2>
        <P>PrivaScan processes the following data exclusively on your device:</P>
        <ul className="mt-2 space-y-1.5">
          <Li>Camera images and video frames — used solely to capture documents</Li>
          <Li>Scanned document images — stored in your device's local storage (IndexedDB)</Li>
          <Li>OCR text extracted from documents — processed on-device using Tesseract.js, never transmitted</Li>
          <Li>App settings (color mode, paper size, language) — stored locally in your browser</Li>
        </ul>

        <H2>3. Data We Do NOT Collect</H2>
        <ul className="mt-2 space-y-1.5">
          <Li>We do not collect, store or transmit your documents or images to any server</Li>
          <Li>We do not use analytics SDKs or tracking pixels</Li>
          <Li>We do not sell, share, or monetize any user data</Li>
          <Li>We do not store any personally identifiable information (PII)</Li>
          <Li>We do not use third-party advertising networks</Li>
        </ul>

        <H2>4. Camera Permission</H2>
        <P>
          PrivaScan requests access to your device camera solely to capture document images.
          Camera access is used only while you are actively using the scanner. We do not record
          video, take background photos, or access your photo library without explicit interaction.
        </P>

        <H2>5. Local Storage</H2>
        <P>
          Scanned documents are saved to IndexedDB, a browser-based local database on your device.
          This data is not synced to any cloud service unless you explicitly choose to export or
          share a document. You can delete all stored scans at any time from the app.
        </P>

        <H2>6. Cloud Backup (Optional)</H2>
        <P>
          PrivaScan offers an optional "Cloud Backup" feature that uses your device's file system
          access API (or mobile share sheet) to save files to services such as Google Drive,
          OneDrive, or Dropbox. This transfer is initiated entirely by you and is subject to the
          privacy policies of the respective cloud service. PrivaScan does not have access to
          your cloud storage accounts.
        </P>

        <H2>7. Subscription & Payments</H2>
        <P>
          Subscriptions are processed through the Apple App Store or Google Play Store depending
          on your platform. PrivaScan does not handle or store your payment information.
          Billing is managed entirely by Apple or Google in accordance with their respective
          privacy policies.
        </P>

        <H2>8. Children's Privacy</H2>
        <P>
          PrivaScan is not directed at children under 13 years of age. We do not knowingly
          collect any personal information from children.
        </P>

        <H2>9. Changes to This Policy</H2>
        <P>
          We may update this Privacy Policy from time to time. Changes will be reflected
          by the "Last updated" date above. Continued use of the app after changes constitutes
          acceptance of the updated policy.
        </P>

        <H2>10. Contact</H2>
        <P>
          If you have questions or concerns about this Privacy Policy, please contact us at:{' '}
          <a
            href="mailto:privacy@privascan.app"
            className="text-sky-400 underline"
          >
            privacy@privascan.app
          </a>
        </P>

        <p className="text-white/20 text-xs mt-10 text-center pb-2">
          © 2026 PrivaScan · All rights reserved
        </p>
      </div>
    </div>
  );
}

/**
 * terms-of-service.tsx — PrivaScan Terms of Service
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

export default function TermsOfServiceScreen() {
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
          <h1 className="text-white font-semibold text-base">Terms of Service</h1>
          <p className="text-white/30 text-xs">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-16">

        <H2>1. Acceptance of Terms</H2>
        <P>
          By downloading, installing, or using PrivaScan ("the App"), you agree to be bound
          by these Terms of Service. If you do not agree to these terms, do not use the App.
        </P>

        <H2>2. Description of Service</H2>
        <P>
          PrivaScan is a document scanning application that processes images locally on your
          device. Features include document capture, perspective correction, image filters,
          OCR text recognition, PDF export, and optional cloud backup.
        </P>

        <H2>3. Subscription & Billing</H2>
        <P>
          PrivaScan offers a Pro subscription at <strong className="text-white/80">€0.99 per month</strong>.
        </P>
        <ul className="mt-2 space-y-1.5">
          <Li>
            Subscriptions are billed monthly through the Apple App Store or Google Play Store
            depending on your platform
          </Li>
          <Li>
            Your subscription automatically renews at the end of each billing period unless
            cancelled at least 24 hours before the renewal date
          </Li>
          <Li>
            The renewal charge is the same as the original purchase price (€0.99/month),
            unless otherwise notified in advance
          </Li>
          <Li>
            You can cancel auto-renewal at any time through your App Store or Google Play
            account settings
          </Li>
          <Li>
            Cancellation takes effect at the end of the current billing period; no partial
            refunds are issued for the remaining period
          </Li>
          <Li>
            Prices may be subject to local taxes depending on your country of residence
          </Li>
        </ul>

        <H2>4. Free Plan</H2>
        <P>
          PrivaScan may offer a free tier with limited functionality. Features available in
          the free tier are subject to change. We reserve the right to modify, restrict,
          or discontinue free features with reasonable notice.
        </P>

        <H2>5. Permitted Use</H2>
        <P>You agree to use PrivaScan only for lawful purposes. You may not:</P>
        <ul className="mt-2 space-y-1.5">
          <Li>Use the App to scan, reproduce, or distribute copyrighted material without authorisation</Li>
          <Li>Use the App to create fraudulent or counterfeit documents</Li>
          <Li>Reverse engineer, decompile, or attempt to extract the App's source code</Li>
          <Li>Use the App in any way that violates applicable local, national, or international law</Li>
        </ul>

        <H2>6. Intellectual Property</H2>
        <P>
          All intellectual property rights in PrivaScan, including but not limited to the
          software, design, logos, and trademarks, are owned by or licensed to PrivaScan.
          You are granted a limited, non-exclusive, non-transferable licence to use the App
          for personal, non-commercial purposes.
        </P>

        <H2>7. Disclaimer of Warranties</H2>
        <P>
          PrivaScan is provided "as is" without warranties of any kind, either express or
          implied. We do not warrant that the App will be error-free, uninterrupted, or
          free of harmful components. Use the App at your own risk.
        </P>

        <H2>8. Limitation of Liability</H2>
        <P>
          To the fullest extent permitted by applicable law, PrivaScan shall not be liable
          for any indirect, incidental, special, consequential, or punitive damages,
          including loss of data, arising from your use of or inability to use the App.
        </P>

        <H2>9. Changes to Terms</H2>
        <P>
          We reserve the right to modify these Terms at any time. Material changes will be
          communicated via the App or email (if applicable). Continued use of the App after
          changes constitutes acceptance of the revised Terms.
        </P>

        <H2>10. Governing Law</H2>
        <P>
          These Terms are governed by and construed in accordance with the laws of the
          European Union and the applicable laws of the country in which you reside,
          without regard to conflict of law provisions.
        </P>

        <H2>11. Contact</H2>
        <P>
          For questions about these Terms, please contact us at:{' '}
          <a
            href="mailto:legal@privascan.app"
            className="text-sky-400 underline"
          >
            legal@privascan.app
          </a>
        </P>

        <p className="text-white/20 text-xs mt-10 text-center pb-2">
          © 2026 PrivaScan · All rights reserved
        </p>
      </div>
    </div>
  );
}

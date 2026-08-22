import { ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';

export default function PrivacyPolicyPage() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="min-h-screen text-white px-5 py-8"
      style={{
        background: '#0d0d14',
        paddingTop: 'calc(2rem + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="max-w-2xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => setLocation('/')}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-8 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <svg className="w-8 h-8 shrink-0" viewBox="0 0 48 48" fill="none">
              <path d="M2,12 L2,2 L12,2"    stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
              <path d="M36,2 L46,2 L46,12"  stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
              <path d="M2,36 L2,46 L12,46"  stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
              <path d="M46,36 L46,46 L36,46" stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
              <rect x="13" y="9" width="22" height="30" rx="1.5" fill="white" opacity="0.92"/>
              <path d="M29,9 L35,15 L29,15 Z" fill="#cbd5e1"/>
              <path d="M29,9 L35,9 L35,15 Z" fill="white" opacity="0.92"/>
            </svg>
            <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
          </div>
          <p className="text-white/40 text-sm">PrivaScan · Last updated: August 2026</p>
        </div>

        <div className="space-y-8 text-[15px] leading-relaxed">

          {/* Overview */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-sky-400">Overview</h2>
            <p className="text-white/70">
              PrivaScan is a privacy-first document scanner. All scanning and processing
              happens entirely on your device. We do not collect, transmit, or store
              your documents, images, or personal data on any server.
            </p>
          </section>

          {/* Data We Collect */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-sky-400">Information We Do NOT Collect</h2>
            <ul className="text-white/70 space-y-2">
              {[
                'Document contents or scanned images',
                'Personal identification information',
                'Location data',
                'Device identifiers or advertising IDs',
                'Usage analytics or behavioral data',
                'Contacts or calendar data',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Camera */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-sky-400">Camera Permission</h2>
            <p className="text-white/70">
              PrivaScan requires camera access solely to let you scan documents.
              Images captured by the camera are processed locally on your device and
              are never sent to any external server. You can revoke camera permission
              at any time in your device settings.
            </p>
          </section>

          {/* Storage */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-sky-400">Storage Permission</h2>
            <p className="text-white/70">
              Storage access is used only to save scanned PDF files to your device
              when you choose to save or export a scan. Files are saved directly to
              your device and are fully under your control.
            </p>
          </section>

          {/* On-Device Processing */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-sky-400">On-Device Processing</h2>
            <p className="text-white/70">
              All document detection, edge correction, and PDF generation run
              entirely within your device. No internet connection is required to
              scan, edit, or export documents.
            </p>
          </section>

          {/* Third-Party Services */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-sky-400">Third-Party Services</h2>
            <p className="text-white/70">
              PrivaScan does not integrate any third-party analytics, advertising,
              or crash-reporting SDKs. The app does not contact any external servers
              during normal operation.
            </p>
          </section>

          {/* Subscription */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-sky-400">Subscription &amp; Billing</h2>
            <p className="text-white/70">
              PrivaScan offers an optional subscription after a free trial period.
              All subscription management and payment processing is handled by
              Google Play. We do not store or process payment card information.
              For details, see{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 underline underline-offset-2"
              >
                Google's Privacy Policy
              </a>.
            </p>
          </section>

          {/* Children */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-sky-400">Children's Privacy</h2>
            <p className="text-white/70">
              PrivaScan does not knowingly collect data from children under 13.
              The app contains no features targeted at children.
            </p>
          </section>

          {/* Changes */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-sky-400">Changes to This Policy</h2>
            <p className="text-white/70">
              We may update this policy to reflect changes in the app. We will
              notify users of material changes by updating the date at the top of
              this page.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-sky-400">Contact</h2>
            <p className="text-white/70">
              Questions about this privacy policy?{' '}
              <a
                href="mailto:yessirh.kim0616@gmail.com"
                className="text-sky-400 underline underline-offset-2"
              >
                yessirh.kim0616@gmail.com
              </a>
            </p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-white/10 text-center text-white/25 text-xs">
          © 2026 PrivaScan. All rights reserved.
        </div>
      </div>
    </div>
  );
}

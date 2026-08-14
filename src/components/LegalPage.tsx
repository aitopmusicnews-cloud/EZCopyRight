import { ArrowLeft, ExternalLink, Scale, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LegalPageId } from '../types';
import LegalFooter from './LegalFooter';

interface Props {
  page: LegalPageId;
  onBack: () => void;
  onNavigate: (page: LegalPageId) => void;
}

const EFFECTIVE_DATE = 'August 13, 2026';
const CONTACT_EMAIL = 'privacy@cts-management.com';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-white/65">{children}</div>
    </section>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-orange-400">{children}</ul>;
}

function Terms() {
  return (
    <>
      <Section title="1. Agreement and eligibility">
        <p>
          These Terms of Service govern your use of EZ Copyright, a THE EZ WAY service operated by The Artist Cut Inc.
          By creating an account, purchasing a service, or using EZ Copyright, you agree to these Terms and our Privacy
          Policy. You must be at least 18 years old and able to enter a binding agreement.
        </p>
      </Section>

      <Section title="2. What EZ Copyright provides">
        <p>
          EZ Copyright helps creators document a version of a musical work using information you provide, a timestamp,
          and a cryptographic hash or fingerprint. It may also provide file storage, account tools, and downloadable
          evidence certificates.
        </p>
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-amber-100">
          EZ Copyright is not the U.S. Copyright Office, a law firm, a notary, or a government registration service. An
          EZ Copyright evidence certificate is not a government-issued copyright registration and does not guarantee
          ownership, admissibility, enforceability, or the outcome of a dispute.
        </div>
        <p>
          Copyright may exist automatically when an original work is fixed in a tangible medium, but formal registration
          can provide additional legal benefits. Learn more from the{' '}
          <a
            href="https://www.copyright.gov/help/faq/faq-general.html"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-orange-300 hover:text-orange-200"
          >
            U.S. Copyright Office <ExternalLink className="h-3.5 w-3.5" />
          </a>
          .
        </p>
      </Section>

      <Section title="3. Your account">
        <p>
          You must provide accurate account information, keep your credentials confidential, and promptly notify us of
          suspected unauthorized access. You are responsible for activity performed through your account unless
          applicable law provides otherwise.
        </p>
      </Section>

      <Section title="4. Your works and permissions">
        <p>You retain ownership of content you submit. You represent and warrant that:</p>
        <List>
          <li>You own the work or have authority to upload and document it.</li>
          <li>Your submission does not infringe copyright, privacy, publicity, contract, or other rights.</li>
          <li>Your metadata and ownership statements are accurate to the best of your knowledge.</li>
          <li>You will not use the Service to create false, fraudulent, misleading, or abusive evidence records.</li>
        </List>
        <p>
          You grant The Artist Cut Inc and its service providers a limited license to host, copy, process, transmit, and
          display your content only as needed to operate, secure, support, and improve the Service, comply with law, and
          carry out your instructions. We do not claim ownership of your musical works.
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>You may not:</p>
        <List>
          <li>Upload malware, unlawful content, or content you are not authorized to use.</li>
          <li>Misrepresent an evidence record as a government registration or guaranteed proof of ownership.</li>
          <li>Probe, disrupt, overload, reverse engineer, or bypass security or access controls.</li>
          <li>Use the Service to harass others, commit fraud, or violate applicable law.</li>
        </List>
      </Section>

      <Section title="6. Fees, subscriptions, and taxes">
        <p>
          Prices and billing terms will be shown before checkout. Payments may be processed by Stripe or another payment
          provider. We do not directly store complete payment-card numbers. You authorize the displayed charge and are
          responsible for applicable taxes. If a subscription is offered, its renewal interval, price, and cancellation
          terms will be displayed at checkout. Refunds are governed by our Refund Policy and applicable law.
        </p>
      </Section>

      <Section title="7. Availability and changes">
        <p>
          We may maintain, modify, suspend, or discontinue features. We do not promise uninterrupted or error-free
          operation. You are responsible for retaining your original source files, project files, exports, receipts, and
          downloaded certificates; EZ Copyright should not be your only copy or backup.
        </p>
      </Section>

      <Section title="8. Suspension and termination">
        <p>
          You may stop using the Service or request account deletion. We may restrict or terminate access when reasonably
          necessary to address nonpayment, misuse, security risk, legal obligations, or a material breach of these Terms.
          Sections that by their nature should survive termination will remain effective.
        </p>
      </Section>

      <Section title="9. Disclaimers">
        <p>
          To the fullest extent permitted by law, the Service is provided “as is” and “as available.” The Artist Cut Inc
          disclaims implied warranties of merchantability, fitness for a particular purpose, noninfringement, and any
          warranty that an evidence record will establish ownership or prevail in a legal proceeding. Nothing in these
          Terms excludes warranties or rights that cannot lawfully be excluded.
        </p>
      </Section>

      <Section title="10. Limitation of liability">
        <p>
          To the fullest extent permitted by law, The Artist Cut Inc and its officers, employees, and service providers
          will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, lost
          profits, lost data, or loss of business opportunity. Our aggregate liability arising from the Service will not
          exceed the amount you paid for the Service during the 12 months before the event giving rise to the claim, or
          $100 if you paid nothing. These limits do not apply where prohibited by law.
        </p>
      </Section>

      <Section title="11. Governing law">
        <p>
          California law governs these Terms without regard to conflict-of-law principles. Any dispute must be brought in
          a court of competent jurisdiction in California, except where applicable consumer law gives you the right to
          proceed elsewhere. Nothing in these Terms limits non-waivable consumer rights.
        </p>
      </Section>

      <Section title="12. Changes and contact">
        <p>
          We may update these Terms. Material changes will be communicated through the Service or by email when required.
          Continued use after the effective date of updated Terms constitutes acceptance where permitted by law.
        </p>
        <p>
          Questions: <a className="text-orange-300" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </>
  );
}

function Privacy() {
  return (
    <>
      <Section title="1. Scope and operator">
        <p>
          This Privacy Policy explains how The Artist Cut Inc, a California corporation, collects, uses, discloses, and
          retains information through EZ Copyright by THE EZ WAY. It applies to our website, accounts, uploads, evidence
          records, payments, support, and related communications.
        </p>
      </Section>

      <Section title="2. Information we collect">
        <List>
          <li><strong className="text-white/80">Account information:</strong> email address, account identifier, authentication status, and policy-consent records.</li>
          <li><strong className="text-white/80">Work information:</strong> titles, artist and contributor names, genres, creation dates, descriptions, lyrics, audio files, filenames, file types, and file sizes.</li>
          <li><strong className="text-white/80">Generated records:</strong> cryptographic hashes, fingerprints, timestamps, record numbers, certificates, and processing status.</li>
          <li><strong className="text-white/80">Transaction information:</strong> purchase amount, currency, payment status, customer and transaction identifiers, and limited billing details supplied by our payment processor. We do not directly store full payment-card numbers.</li>
          <li><strong className="text-white/80">Technical and security information:</strong> IP address, browser and device information, logs, session data, error reports, and fraud or abuse signals.</li>
          <li><strong className="text-white/80">Communications:</strong> messages and information you provide when requesting support, privacy assistance, or account changes.</li>
        </List>
        <p>
          EZ Copyright calculates a file hash locally in your browser, then transmits the audio file you submit through
          an encrypted connection to private cloud storage. Access to stored audio uses short-lived signed links tied to
          your authenticated account.
        </p>
      </Section>

      <Section title="3. How we use information">
        <List>
          <li>Provide accounts, uploads, evidence records, certificates, payments, receipts, and customer support.</li>
          <li>Authenticate users and prevent fraud, abuse, unauthorized access, and security incidents.</li>
          <li>Maintain, troubleshoot, measure, and improve reliability and user experience.</li>
          <li>Send account verification, transaction, service, security, and policy communications.</li>
          <li>Enforce our Terms, resolve disputes, and comply with legal obligations.</li>
        </List>
        <p>We do not sell personal information or share it for cross-context behavioral advertising.</p>
      </Section>

      <Section title="4. How we disclose information">
        <p>We may disclose information to:</p>
        <List>
          <li><strong className="text-white/80">Infrastructure providers,</strong> including Amazon Web Services and Render, for hosting, authentication, databases, file storage, security, and email delivery.</li>
          <li><strong className="text-white/80">Payment processors,</strong> including Stripe, to process purchases, refunds, fraud screening, and billing support.</li>
          <li><strong className="text-white/80">Professional advisers and authorities</strong> when reasonably necessary for legal, accounting, security, compliance, or protection of rights and safety.</li>
          <li><strong className="text-white/80">Transaction participants</strong> in a merger, financing, acquisition, reorganization, or sale of assets, subject to appropriate confidentiality protections.</li>
        </List>
        <p>We may also disclose information at your direction or with your consent.</p>
      </Section>

      <Section title="5. Storage and retention">
        <p>
          We retain information only for as long as reasonably necessary to provide the Service, preserve requested
          evidence records, maintain security and audit logs, complete transactions, resolve disputes, enforce agreements,
          and meet legal obligations. Retention depends on the type of information, your account status, your instructions,
          and applicable law. Deletion from encrypted backups may occur on a delayed cycle.
        </p>
        <p>
          EZ Copyright records are private by default and are not U.S. Copyright Office public records. If you choose to
          share a certificate or file, the recipient may retain it independently.
        </p>
      </Section>

      <Section title="6. Security">
        <p>
          We use administrative, technical, and organizational safeguards designed to protect information, including
          access controls, encryption in transit, restricted service credentials, and security monitoring where supported.
          No system is completely secure, and we cannot guarantee absolute security. Keep independent copies of your work.
        </p>
      </Section>

      <Section title="7. Cookies and local storage">
        <p>
          We use browser storage, session tokens, and similar technologies necessary for authentication, security,
          preferences, and core Service functionality. We do not use third-party behavioral advertising cookies at launch.
          If that practice changes, we will update this Policy and provide choices required by law.
        </p>
      </Section>

      <Section title="8. Your choices and privacy rights">
        <p>
          You may request access, correction, deletion, or export of information associated with your account. Depending
          on where you live, you may have additional rights to know, correct, delete, or limit certain processing and to
          appeal a decision. We may verify your identity before completing a request. We will not discriminate against you
          for exercising applicable privacy rights.
        </p>
        <p>
          Submit requests to <a className="text-orange-300" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We do not
          currently sell or share personal information, so a “Do Not Sell or Share” opt-out is not required for our stated
          practices. Authorized agents may submit requests where permitted by law.
        </p>
      </Section>

      <Section title="9. Children">
        <p>
          EZ Copyright is intended for adults and is not directed to children under 13. Users must be at least 18. We do
          not knowingly collect personal information from children. Contact us if you believe a child supplied information.
        </p>
      </Section>

      <Section title="10. Changes and contact">
        <p>
          We may update this Policy to reflect changes in the Service, our practices, or law. We will post the revised
          version and update the effective date, and provide additional notice when required.
        </p>
        <p>
          The Artist Cut Inc · California · <a className="text-orange-300" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </>
  );
}

function RefundPolicy() {
  return (
    <>
      <Section title="1. Digital-service purchases">
        <p>
          EZ Copyright provides digital processing and evidence-record services that may begin immediately after payment.
          Because a completed evidence record and certificate cannot be “returned,” completed services are generally
          non-refundable except as described below or where required by law.
        </p>
      </Section>

      <Section title="2. Refund eligibility">
        <p>You may request a refund within 14 days of the charge when:</p>
        <List>
          <li>You were charged more than once for the same purchase.</li>
          <li>We did not deliver the purchased service because of a verified technical failure and could not remedy it.</li>
          <li>The charge was incorrect or another refund right applies under law.</li>
        </List>
        <p>
          We generally do not refund a successfully generated evidence record or certificate, unused time in a billing
          period, or a purchase made with inaccurate information supplied by the user. We may make exceptions at our
          discretion without creating an obligation to do so in other cases.
        </p>
      </Section>

      <Section title="3. Subscriptions and cancellation">
        <p>
          If subscriptions are offered, you may cancel before the next renewal through the available account or billing
          controls. Cancellation stops future renewal charges but does not normally create a prorated refund for the
          current billing period unless required by law or stated at checkout.
        </p>
      </Section>

      <Section title="4. How to request a refund">
        <p>
          Email <a className="text-orange-300" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with the account email,
          transaction date, amount, and reason for the request. Do not send full card numbers, passwords, or one-time
          security codes. We may request non-sensitive information needed to locate and verify the transaction.
        </p>
      </Section>

      <Section title="5. Processing time">
        <p>
          Approved refunds are returned to the original payment method. We aim to submit approved refunds within 5–10
          business days, but your bank or payment provider may take additional time to post the credit.
        </p>
      </Section>

      <Section title="6. Payment disputes">
        <p>
          Contact us first so we can investigate quickly. Nothing in this Policy limits rights you may have through your
          payment provider or applicable consumer law.
        </p>
      </Section>
    </>
  );
}

const pageDetails: Record<LegalPageId, { title: string; description: string; content: ReactNode }> = {
  terms: {
    title: 'Terms of Service',
    description: 'The rules governing your use of EZ Copyright.',
    content: <Terms />,
  },
  privacy: {
    title: 'Privacy Policy',
    description: 'How The Artist Cut Inc handles information for EZ Copyright.',
    content: <Privacy />,
  },
  'refund-policy': {
    title: 'Refund Policy',
    description: 'When and how EZ Copyright purchase refunds are reviewed.',
    content: <RefundPolicy />,
  },
};

export default function LegalPage({ page, onBack, onNavigate }: Props) {
  const details = pageDetails[page];

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-stone-950 to-neutral-950 text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-neutral-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <button
            type="button"
            onClick={onBack}
            className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to EZ Copyright
          </button>
          <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
            {page === 'privacy' ? <ShieldCheck className="h-4 w-4 text-orange-400" /> : <Scale className="h-4 w-4 text-orange-400" />}
            The Artist Cut Inc
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:py-16">
        <div className="mb-10 border-b border-white/10 pb-8">
          <div className="mb-5 flex items-center gap-3">
            <img src="/ez-way-logo.png" alt="THE EZ WAY" className="h-12 w-12 object-contain" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">EZ Copyright</p>
              <p className="text-sm text-white/45">A THE EZ WAY service</p>
            </div>
          </div>
          <h1 className="mb-3 text-4xl font-bold sm:text-5xl" style={{ fontFamily: 'Playfair Display, serif' }}>
            {details.title}
          </h1>
          <p className="text-white/55">{details.description}</p>
          <p className="mt-3 text-xs text-white/35">Effective and last updated: {EFFECTIVE_DATE}</p>
        </div>

        <div className="space-y-10 rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-10">
          {details.content}
        </div>

      </main>

      <LegalFooter onNavigate={onNavigate} showBrand />
    </div>
  );
}

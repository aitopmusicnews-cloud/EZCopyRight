import type { LegalPageId } from '../types';

interface Props {
  onNavigate: (page: LegalPageId) => void;
  showBrand?: boolean;
}

const links: Array<{ page: LegalPageId; label: string; path: string }> = [
  { page: 'terms', label: 'Terms of Service', path: '/terms' },
  { page: 'privacy', label: 'Privacy Policy', path: '/privacy' },
  { page: 'refund-policy', label: 'Refund Policy', path: '/refund-policy' },
];

export default function LegalFooter({ onNavigate, showBrand = false }: Props) {
  return (
    <footer className="border-t border-white/10 bg-neutral-950 px-4 py-8 text-center">
      {showBrand && (
        <div className="mb-3 flex items-center justify-center gap-3">
          <img src="/ez-way-logo.png" alt="THE EZ WAY" className="h-8 w-8 object-contain" />
          <span className="text-lg font-bold text-white">THE EZ WAY</span>
        </div>
      )}
      <nav aria-label="Legal" className="mb-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {links.map((link) => (
          <a
            key={link.page}
            href={link.path}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(link.page);
            }}
            className="cursor-pointer text-sm text-white/50 transition hover:text-orange-300"
          >
            {link.label}
          </a>
        ))}
        <a
          href="mailto:privacy@cts-management.com"
          className="text-sm text-white/50 transition hover:text-orange-300"
        >
          Contact
        </a>
      </nav>
      <p className="text-xs text-white/30">
        © {new Date().getFullYear()} The Artist Cut Inc. EZ Copyright is a THE EZ WAY service.
      </p>
    </footer>
  );
}

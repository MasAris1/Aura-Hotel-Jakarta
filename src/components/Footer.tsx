import Link from "next/link";
import { ArrowUpRight, MapPin, Phone, Mail } from "lucide-react";

const footerLinks = {
  explore: [
    { label: "Homepage", href: "/" },
    { label: "Facilities", href: "/#facilities" },
    { label: "Suites Collection", href: "/#collection" },
  ],
  hospitality: [
    { label: "Reserve a Stay", href: "/booking" },
    { label: "Guest Portal", href: "/dashboard" },
    { label: "Concierge Access", href: "/login" },
  ],
};

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-primary/12 bg-[#080a0f]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent" />
      <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-[140px]" />

      <div className="relative mx-auto max-w-7xl px-6 pb-10 pt-20">
        <div className="grid gap-12 border-b border-white/8 pb-14 lg:grid-cols-[1.25fr_0.8fr_0.8fr_1fr]">
          <div>
            <span className="text-[11px] uppercase tracking-[0.34em] text-primary/80">
              Aura Hotel Jakarta
            </span>
            <h2 className="mt-5 max-w-md font-serif text-4xl leading-tight text-white">
              Quiet luxury, shaped for evenings above the city.
            </h2>
            <p className="mt-6 max-w-xl text-sm leading-7 text-white/58">
              A refined stay experience with skyline views, intuitive booking,
              and concierge-led hospitality from arrival until late check-out.
            </p>

            <Link
              href="/booking"
              className="mt-8 inline-flex items-center gap-3 rounded-full border border-primary/30 bg-primary/10 px-5 py-3 text-xs uppercase tracking-[0.28em] text-primary transition-all duration-300 hover:border-primary/50 hover:bg-primary hover:text-primary-foreground"
            >
              Reserve your stay
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div>
            <h3 className="text-sm uppercase tracking-[0.28em] text-white/72">Explore</h3>
            <div className="mt-6 space-y-4 text-sm text-white/56">
              {footerLinks.explore.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="block transition-colors duration-300 hover:text-primary"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm uppercase tracking-[0.28em] text-white/72">Hospitality</h3>
            <div className="mt-6 space-y-4 text-sm text-white/56">
              {footerLinks.hospitality.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="block transition-colors duration-300 hover:text-primary"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm uppercase tracking-[0.28em] text-white/72">Concierge Desk</h3>
            <div className="mt-6 space-y-5 text-sm text-white/58">
              <p className="flex items-start gap-3 leading-7">
                <MapPin className="mt-1 h-4 w-4 text-primary" />
                <span>Bundaran HI, Central Jakarta, Indonesia</span>
              </p>
              <p className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-primary" />
                <span>+62 21 5088 7777</span>
              </p>
              <p className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-primary" />
                <span>concierge@aura-jakarta.com</span>
              </p>
            </div>
          </div>
        </div>


      </div>
    </footer>
  );
}

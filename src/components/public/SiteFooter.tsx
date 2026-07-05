import { Link } from "react-router-dom";
import { Building2, HeartHandshake, ArrowRight } from "lucide-react";
import { BusinessLeadForm } from "@/components/public/BusinessLeadForm";

/* ────────────────────────────────────────────────────────────────────────────
 * SiteFooter — SEO-rich footer for the public renter marketplace.
 *
 * Dense internal linking into the static content hub (342 articles / 3 pillars)
 * to spread crawl equity and help discovery. IMPORTANT: links to STATIC hub
 * pages use plain <a href> (full-page navigation — they are NOT React-router
 * routes and a <Link> would hit the SPA 404). SPA routes use <Link>.
 * All hrefs point at pages that actually exist on disk.
 * ──────────────────────────────────────────────────────────────────────────── */

const PHONE_DISPLAY = "(440) 444-4737";
const PHONE_E164 = "+14404444737";
const EMAIL = "support@rentfindercleveland.com";

type L = { t: string; h: string };

const POPULAR: L[] = [
  { t: "Houses for Rent in Cleveland", h: "/houses-for-rent-cleveland-oh/" },
  { t: "Apartments for Rent in Cleveland", h: "/apartments-for-rent-cleveland-oh/" },
  { t: "Section 8 Housing in Cleveland", h: "/section-8-housing-cleveland-oh/" },
  { t: "Cheap Houses for Rent", h: "/cleveland-rentals/houses/cheap-houses-for-rent-cleveland-ohio/" },
  { t: "Low-Income Apartments", h: "/cleveland-rentals/apartments/low-income-apartments-cleveland-ohio/" },
  { t: "Rooms for Rent in Cleveland", h: "/cleveland-rentals/more/rooms-for-rent-cleveland-ohio/" },
  { t: "All Rentals & Guides", h: "/cleveland-rentals/" },
];

const NEIGHBORHOODS: L[] = [
  { t: "Ohio City", h: "/cleveland-rentals/neighborhoods/houses-for-rent-ohio-city-cleveland/" },
  { t: "Tremont", h: "/cleveland-rentals/neighborhoods/houses-for-rent-tremont-cleveland/" },
  { t: "Downtown", h: "/cleveland-rentals/neighborhoods/houses-for-rent-downtown-cleveland/" },
  { t: "University Circle", h: "/cleveland-rentals/neighborhoods/houses-for-rent-university-circle-cleveland/" },
  { t: "Little Italy", h: "/cleveland-rentals/neighborhoods/houses-for-rent-little-italy-cleveland/" },
  { t: "Slavic Village", h: "/cleveland-rentals/neighborhoods/houses-for-rent-slavic-village-cleveland/" },
  { t: "Collinwood", h: "/cleveland-rentals/neighborhoods/houses-for-rent-collinwood-cleveland/" },
  { t: "Glenville", h: "/cleveland-rentals/neighborhoods/houses-for-rent-glenville-cleveland/" },
  { t: "All neighborhoods →", h: "/cleveland-rentals/neighborhoods/" },
];

const SUBURBS: L[] = [
  { t: "Lakewood, OH", h: "/cleveland-rentals/suburbs/houses-for-rent-lakewood-ohio/" },
  { t: "Parma, OH", h: "/cleveland-rentals/suburbs/houses-for-rent-parma-ohio/" },
  { t: "Cleveland Heights, OH", h: "/cleveland-rentals/suburbs/houses-for-rent-cleveland-heights-ohio/" },
  { t: "Euclid, OH", h: "/cleveland-rentals/suburbs/houses-for-rent-euclid-ohio/" },
  { t: "Shaker Heights, OH", h: "/cleveland-rentals/suburbs/houses-for-rent-shaker-heights-ohio/" },
  { t: "Lorain, OH", h: "/cleveland-rentals/suburbs/houses-for-rent-lorain-ohio/" },
  { t: "All suburbs →", h: "/cleveland-rentals/suburbs/" },
];

const SECTION8: L[] = [
  { t: "Section 8 Houses for Rent", h: "/cleveland-rentals/section-8/section-8-houses-for-rent-cleveland-ohio/" },
  { t: "Landlords That Accept Section 8", h: "/cleveland-rentals/section-8/landlords-that-accept-section-8-cleveland/" },
  { t: "How to Apply for a Voucher (CMHA)", h: "/cleveland-rentals/section-8/how-to-apply-section-8-cleveland-cmha/" },
  { t: "Documents You'll Need", h: "/cleveland-rentals/section-8/section-8-application-documents-cleveland/" },
  { t: "HQS Inspection Checklist", h: "/cleveland-rentals/section-8/section-8-inspection-checklist-cleveland/" },
  { t: "All Section 8 guides →", h: "/cleveland-rentals/section-8/" },
];

const BY_TYPE: L[] = [
  { t: "2-Bedroom Houses (East Side)", h: "/cleveland-rentals/houses/2-bedroom-houses-for-rent-cleveland-east-side/" },
  { t: "3-Bedroom Houses (East Side)", h: "/cleveland-rentals/houses/3-bedroom-houses-for-rent-cleveland-east-side/" },
  { t: "4-Bedroom Houses for Rent", h: "/cleveland-rentals/houses/4-bedroom-houses-for-rent-cleveland-ohio/" },
  { t: "1-Bedroom Houses for Rent", h: "/cleveland-rentals/houses/1-bedroom-houses-for-rent-cleveland-ohio/" },
  { t: "Apartments Under $700", h: "/cleveland-rentals/apartments/apartments-for-rent-cleveland-under-700/" },
  { t: "Downtown Apartments", h: "/cleveland-rentals/apartments/downtown-cleveland-apartments-for-rent/" },
  { t: "All houses by type →", h: "/cleveland-rentals/houses/" },
];

const GUIDES: L[] = [
  { t: "Rental Application Fees in Ohio", h: "/cleveland-rentals/guides/rental-application-fee-ohio/" },
  { t: "Wear & Tear vs. Damage (Deposits)", h: "/cleveland-rentals/guides/normal-wear-and-tear-ohio-rental/" },
  { t: "Do You Need a Co-Signer?", h: "/cleveland-rentals/guides/cosigner-to-rent-apartment-ohio/" },
  { t: "Cleveland Lead-Safe Certification", h: "/cleveland-rentals/guides/cleveland-lead-safe-certification-renters/" },
  { t: "Starting Your Utilities", h: "/cleveland-rentals/guides/cleveland-public-power-vs-illuminating-company/" },
  { t: "All renter guides →", h: "/cleveland-rentals/guides/" },
];

const COLUMNS: { title: string; links: L[] }[] = [
  { title: "Popular Searches", links: POPULAR },
  { title: "By Neighborhood", links: NEIGHBORHOODS },
  { title: "Nearby Suburbs", links: SUBURBS },
  { title: "Section 8 & Vouchers", links: SECTION8 },
  { title: "By Bedrooms & Budget", links: BY_TYPE },
  { title: "Renter Guides", links: GUIDES },
];

/** A hub link column. All targets are static pages → plain <a href>. */
function LinkColumn({ title, links }: { title: string; links: L[] }) {
  return (
    <div>
      <div className="font-semibold text-white mb-3 text-sm">{title}</div>
      <ul className="space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.h}>
            <a href={l.h} className="text-slate-400 hover:text-white transition-colors">{l.t}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-[hsl(222,47%,11%)] text-slate-300">
      <div className="max-w-7xl mx-auto px-5 py-12">
        {/* ── Highlighted B2B band: housing partners + corporate leasing ── */}
        <div className="grid gap-5 md:grid-cols-2 mb-10">
          {/* Housing partners / voucher-assistance orgs */}
          <div className="rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/10 to-transparent p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <HeartHandshake className="h-5 w-5 text-emerald-300" />
              </div>
              <h3 className="font-bold text-white">Housing Partners &amp; Case Managers</h3>
            </div>
            <p className="text-sm text-slate-400 mb-3 leading-relaxed">
              Place clients faster. If you help people secure or use Housing Choice Vouchers — case managers,
              housing navigators, shelters, and social-service agencies — connect with our team to move voucher
              holders into homes that welcome them.{" "}
              <a href="/housing-partners/" className="text-emerald-300 hover:text-white underline underline-offset-2 inline-flex items-center gap-1">
                Learn more <ArrowRight className="h-3 w-3" />
              </a>
            </p>
            <BusinessLeadForm leadType="housing_partner" source="footer" />
          </div>

          {/* Corporate leasing */}
          <div className="rounded-2xl border border-indigo-400/25 bg-gradient-to-br from-indigo-500/10 to-transparent p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-indigo-300" />
              </div>
              <h3 className="font-bold text-white">Corporate &amp; Relocation Leasing</h3>
            </div>
            <p className="text-sm text-slate-400 mb-3 leading-relaxed">
              Housing a team in Greater Cleveland? Tell us what your employees or relocating staff need and
              we'll see how we can help with local rental homes.{" "}
              <a href="/corporate-leasing/" className="text-indigo-300 hover:text-white underline underline-offset-2 inline-flex items-center gap-1">
                Learn more <ArrowRight className="h-3 w-3" />
              </a>
            </p>
            <BusinessLeadForm leadType="corporate_leasing" source="footer" variant="accent" />
          </div>
        </div>

        {/* Brand + SEO intro */}
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] items-center pb-8 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img
                src="/favicon-96.png"
                alt="Rent Finder Cleveland"
                className="w-9 h-9 rounded-full"
                width={36}
                height={36}
              />
              <span className="font-bold text-white">Rent Finder Cleveland</span>
            </div>
            <p className="text-sm text-slate-400 max-w-xl leading-relaxed">
              Rent Finder Cleveland is a local rental team helping renters find{" "}
              <a href="/houses-for-rent-cleveland-oh/" className="text-slate-300 hover:text-white underline underline-offset-2">houses for rent in Cleveland, OH</a>{" "}
              and{" "}
              <a href="/apartments-for-rent-cleveland-oh/" className="text-slate-300 hover:text-white underline underline-offset-2">apartments across Greater Cleveland</a>.
              Every home welcomes{" "}
              <a href="/section-8-housing-cleveland-oh/" className="text-slate-300 hover:text-white underline underline-offset-2">Section 8 / Housing Choice Vouchers</a>.
              Browse rentals by neighborhood, bedrooms, and budget, or explore our renter guides below.
            </p>
          </div>
          <div className="lg:text-right">
            <div className="font-semibold text-white mb-2 text-sm">Talk to our local team</div>
            <p className="text-sm">
              <a href={`tel:${PHONE_E164}`} className="text-accent font-semibold text-base">{PHONE_DISPLAY}</a><br />
              <a href={`mailto:${EMAIL}`} className="text-accent">{EMAIL}</a>
            </p>
            <div className="flex items-center gap-3 mt-3 lg:justify-end flex-wrap">
              <Link
                to="/p/book-showing"
                className="inline-flex items-center justify-center h-9 px-4 text-xs font-semibold rounded-full bg-primary text-primary-foreground hover:opacity-90 whitespace-nowrap"
              >
                Schedule a Showing
              </Link>
              <a
                href="/#listings"
                className="inline-flex items-center justify-center h-9 px-4 text-xs font-semibold rounded-full border border-slate-600 text-slate-200 hover:border-slate-400 whitespace-nowrap"
              >
                Browse Rentals
              </a>
            </div>
          </div>
        </div>

        {/* Internal-link columns */}
        <nav aria-label="Cleveland rentals sitemap" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8 py-8">
          {COLUMNS.map((c) => <LinkColumn key={c.title} title={c.title} links={c.links} />)}
        </nav>

        {/* Bottom bar */}
        <div className="border-t border-slate-800 pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
            <Link to="/saas" className="hover:text-white">For Property Managers</Link>
            <Link to="/p/book-showing" className="hover:text-white">Schedule a Showing</Link>
            <a href="/cleveland-rentals/" className="hover:text-white">Renter Resources</a>
            <Link to="/p/privacy-policy" className="hover:text-white">Privacy Policy</Link>
            <Link to="/p/terms-of-service" className="hover:text-white">Terms of Service</Link>
          </div>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed mt-4">
          © {new Date().getFullYear()} Rent Finder Cleveland, LLC. All rights reserved. Rent Finder Cleveland is an
          equal housing opportunity provider and does business in accordance with the Fair Housing Act. Serving Cleveland,
          Ohio and surrounding Cuyahoga County communities.
        </p>
      </div>
    </footer>
  );
}

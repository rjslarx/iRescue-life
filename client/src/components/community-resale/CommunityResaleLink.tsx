import { Link } from "wouter";
import { ArrowUpRight, HeartHandshake } from "lucide-react";

export default function CommunityResaleLink() {
  return <Link href="/dashboard/community-resale" className="flex flex-wrap items-center gap-4 rounded-xl border border-[#b8cdc5] bg-[#e8efE8] p-5 text-[#294d50] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"><HeartHandshake className="h-8 w-8 shrink-0" strokeWidth={1.4} /><div className="min-w-0 flex-1"><h2 className="font-semibold">Acadiana Community Resale</h2><p className="text-sm">Review neighbor-submitted listings, manage participation, and follow rescue proceeds.</p></div><span className="inline-flex items-center gap-2 text-sm font-semibold">Open workspace <ArrowUpRight className="h-4 w-4" /></span></Link>;
}

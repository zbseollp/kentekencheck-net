export const SITE = {
  name: "Kentekencheck.net",
  url: "https://kentekencheck.net",
  tagline: "De snelste 100% gratis kenteken check van Nederland.",
  description:
    "Ontdek het volledige verleden van elk voertuig: schadeverleden, kilometerstand, APK-status en eigenarenhistorie. Direct en gratis.",
  ga: import.meta.env.PUBLIC_GA_MEASUREMENT_ID ?? "",
};

export const REDIRECT_BASE = "https://www.kentekencheck.nu/kenteken/";

export const NAV_KENTEKENCHECKS = [
  { label: "Schadeverleden auto", href: "/schadeverleden-auto/" },
  { label: "Belgische kenteken", href: "/belgische-kenteken-check/" },
  { label: "Eigenaren check", href: "/kenteken-check-eigenaar/" },
  { label: "Scooter check", href: "/kenteken-check-scooter/" },
  { label: "Nummerplaat opzoeken", href: "/nummerplaat-opzoeken/" },
  { label: "Duitse kenteken", href: "/duitse-kenteken-check/" },
  { label: "Chassisnummer check", href: "/chassisnummer-check/" },
  { label: "Kilometerstand check", href: "/kilometerstand-controleren/" },
  { label: "Gestolen auto check", href: "/gestolen-auto-check/" },
  { label: "Autohistorie", href: "/autohistorie/" },
  { label: "APK keuring", href: "/apk-keuring/" },
  { label: "RDW OVI check", href: "/rdw-ovi/" },
];

export const NAV_WAARDECHECKS = [
  { label: "Afgekeurde auto verkopen", href: "/afgekeurde-auto-verkopen/" },
  { label: "Auto verkopen particulier", href: "/auto-verkopen-particulier/" },
  { label: "Total loss verkopen", href: "/total-loss-auto-verkopen/" },
  { label: "Cataloguswaarde auto", href: "/cataloguswaarde-auto/" },
  { label: "Schadeauto verkopen", href: "/schadeauto-verkopen/" },
  { label: "ANWB autowaarde", href: "/anwb-autowaarde/" },
  { label: "Dagwaarde motor", href: "/dagwaarde-motor/" },
  { label: "Inruilwaarde auto", href: "/inruilwaarde-auto/" },
  { label: "Dagwaarde auto", href: "/dagwaarde-auto/" },
  { label: "Auto taxeren", href: "/auto-taxeren/" },
];

export const NAV_AUTOINFO = [
  { label: "Auto importeren Duitsland", href: "/auto-importeren-duitsland/" },
  { label: "Auto naar de sloop", href: "/auto-naar-de-sloop/" },
  { label: "Bijtelling berekenen", href: "/bijtelling-berekenen-via-kenteken/" },
  { label: "Bouwjaar auto", href: "/bouwjaar-auto/" },
  { label: "BPM berekenen", href: "/bpm-berekenen/" },
  { label: "Kenteken overschrijven", href: "/kenteken-overschrijven/" },
  { label: "Kenteken voorspellen", href: "/kenteken-voorspellen/" },
  { label: "Meldcode auto", href: "/meldcode-auto/" },
  { label: "Tenaamstellingscode", href: "/tenaamstellingscode/" },
  { label: "Wegenbelasting op kenteken", href: "/wegenbelasting-op-kenteken/" },
  { label: "WOK melding", href: "/wok-melding/" },
];

export const POPULAR_CHECKS = [
  { label: "Schadeverleden auto", href: "/schadeverleden-auto/" },
  { label: "Kilometerstand check", href: "/kilometerstand-controleren/" },
  { label: "APK keuring check", href: "/apk-keuring/" },
  { label: "Eigenaren check", href: "/kenteken-check-eigenaar/" },
  { label: "Gestolen auto check", href: "/gestolen-auto-check/" },
  { label: "Duitse kenteken", href: "/duitse-kenteken-check/" },
  { label: "Belgische kenteken", href: "/belgische-kenteken-check/" },
  { label: "Chassisnummer check", href: "/chassisnummer-check/" },
  { label: "RDW OVI check", href: "/rdw-ovi/" },
];

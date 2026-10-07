// CubeMore: the site's name, and how people can reach you.
//
// FILL IN your contact details here. Anything left empty ("") simply isn't
// shown, so nothing is published until you put it in. The social links also
// tell search engines these profiles are CubeMore's (structured data, "sameAs").

export const SITE = {
  name: "CubeMore",
  tagline: "Live speedcubing races",
  description:
    "Race other cubers live: everyone gets the same scramble, a stackmat-style timer, WCA averages. 3x3 to 7x7, Pyraminx, Skewb, Clock and more. Free, in your browser.",

  /** Shown on the contact page as "Email us". e.g. "hello@cubemore.com" */
  email: "kmbqueensky@gmail.com",

  /** Full links, e.g. "https://instagram.com/cubemore.com". Shown on the contact page and in the footer. */
  socials: {
    instagram: "https://www.instagram.com/kajusipro",
    facebook: "https://www.facebook.com/bolortuya.khaliun",
    youtube: "https://youtube.com/@khaliunbolortuya?si=UaRgF3is8kSk0FdG",
  },
};

export const SOCIAL_LABELS: Record<keyof typeof SITE.socials, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};

/** The social links that are filled in, in a fixed order. */
export function socialLinks(): {
  key: keyof typeof SITE.socials;
  label: string;
  url: string;
}[] {
  return (Object.keys(SITE.socials) as (keyof typeof SITE.socials)[])
    .filter((key) => SITE.socials[key])
    .map((key) => ({ key, label: SOCIAL_LABELS[key], url: SITE.socials[key] }));
}

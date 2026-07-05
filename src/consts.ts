export const SITE = {
  name: 'Sahin Ahmed',
  title: 'Sahin Ahmed — machine learning & data science',
  description:
    'Tutorials, deep-dives, and projects on machine learning, data science, and the engineering underneath.',
  email: 'sahin.samia@gmail.com',
};

export const NAV = [
  { label: 'writing', href: '/writing' },
  { label: 'projects', href: '/projects' },
  { label: 'about', href: '/about' },
];

export const SOCIALS = [
  { label: 'GitHub', href: 'https://github.com/sahin1994', icon: 'ti-brand-github' },
  { label: 'X', href: 'https://x.com/', icon: 'ti-brand-x' },
  { label: 'LinkedIn', href: 'https://linkedin.com/', icon: 'ti-brand-linkedin' },
  { label: 'RSS', href: '/rss.xml', icon: 'ti-rss' },
];

// Category → color role. Keep this small; group new categories rather than
// minting new colors.
export const CATEGORY_COLOR: Record<string, 'pro' | 'warning' | 'accent' | 'success'> = {
  tutorial: 'pro',
  'deep-dive': 'warning',
  guide: 'accent',
  note: 'success',
};

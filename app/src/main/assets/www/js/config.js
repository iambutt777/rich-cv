/* =========================================================================
   Rich CV Maker : Resume Builder - settings you may want to change.
   ========================================================================= */
window.RICH_CONFIG = {
  company: {
    name: 'RICH CV MAKER',
    shortName: 'Rich CV Maker',
    tagline: 'Resume Builder',
    documentTitle: 'Curriculum Vitae'
  },

  // Brand colours (used by both the app and the PDF)
  brand: {
    navy:  '#0B1F4B',
    navy2: '#132E6B',
    royal: '#1F4FD8',
    gold:  '#E8B21E',
    goldSoft: '#FBF3DC',
    ink:   '#1A2238',
    muted: '#5B6582',
    line:  '#D7DCE8',
    rowAlt:'#F4F6FB',
    white: '#FFFFFF'
  },

  // Language levels shown on the CV (5 bars)
  languageLevels: ['Basic', 'Intermediate', 'Good', 'Fluent', 'Native'],

  defaults: {
    references: '',          // (v4.19) empty: the References section is left out unless the user writes something
    design: 'sidebar'
  },

  limits: { summary: 900, duties: 900, details: 400 },

  // Premium (one-time "Unlock Premium" in the Android app, see js/premium.js and Billing.java).
  // Lock templates by category (e.g. ['Premium']) or by template id. Locked templates can still be
  // tried in the preview; downloading, printing or sharing them asks the user to unlock Premium.
  // Settings menu: "Contact us" (hidden while email is empty), "Share app" and "Rate us"
  contact: {
    email: 'iambutt777@gmail.com',   // support email (Settings > Contact us)
    playUrl: 'https://play.google.com/store/apps/details?id=com.globalcareerconnect.cvmaker'
  },

  premium: {
    productId: 'premium_unlock',
    allColoursFree: true,   // (v4.70) every colour theme is free for everyone
    freeColours: ['royal', 'emerald', 'teal', 'sky', 'burgundy', 'purple', 'charcoal'],   // (used only if allColoursFree is false)
    lockedCategories: ['Premium'],   // (v4.41) Pro: all 24 Premium templates (12 Premium + 12 Luxury). e.g. [] unlocks everything
    lockedTemplates: ['@Sunset Stripe', '@Fresh Corner', '@Charcoal Round', '@Teal Narrow', '@Forest Corner']   // ids, or @ + the template's name
  },

  // Ad places (see js/ads.js). placeholders: true shows dashed "Ad space" boxes
  // so you can see where ads go; set it to false to hide them until real ads are added.
  ads: {
    enabled: false,          // true once the Android app shows real ads (AdMob)
    placeholders: true,      // show the ad places as dashed boxes
    bottomBanner: true,      // banner fixed at the bottom of the screen
    interstitialEvery: 2,    // full-screen ad after every 2nd download...
    minSecondsBetween: 60    // ...and at most once a minute
  }
};

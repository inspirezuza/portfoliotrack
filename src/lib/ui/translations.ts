export const languages = ["EN", "TH"] as const;
export const themes = ["light", "dark"] as const;

export type UiLanguage = (typeof languages)[number];
export type UiTheme = (typeof themes)[number];

export const shellCopy: Record<
  UiLanguage,
  {
    appTagline: string;
    nav: {
      dashboard: string;
      holdings: string;
      transactions: string;
    };
    navShort: {
      dashboard: string;
      holdings: string;
      transactions: string;
    };
    language: string;
    themeLabel: string;
    theme: {
      light: string;
      dark: string;
    };
  }
> = {
  TH: {
    appTagline: "",
    nav: {
      dashboard: "ภาพรวม",
      holdings: "หุ้นที่ถือ",
      transactions: "รายการซื้อขาย"
    },
    navShort: {
      dashboard: "ภาพ",
      holdings: "หุ้น",
      transactions: "ซื้อ"
    },
    language: "ภาษา",
    themeLabel: "ธีม",
    theme: {
      light: "สว่าง",
      dark: "มืด"
    }
  },
  EN: {
    appTagline: "",
    nav: {
      dashboard: "Dashboard",
      holdings: "Holdings",
      transactions: "Transactions"
    },
    navShort: {
      dashboard: "Dash",
      holdings: "Hold",
      transactions: "Trade"
    },
    language: "Language",
    themeLabel: "Theme",
    theme: {
      light: "Light",
      dark: "Dark"
    }
  }
};

export const languages = ["TH", "EN"] as const;
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
    theme: {
      light: string;
      dark: string;
    };
  }
> = {
  TH: {
    appTagline: "พอร์ตส่วนตัวที่อ่านง่าย เก็บข้อมูลไว้ในเครื่อง",
    nav: {
      dashboard: "ภาพรวม",
      holdings: "หุ้นที่ถือ",
      transactions: "รายการซื้อขาย"
    },
    theme: {
      light: "สว่าง",
      dark: "มืด"
    }
  },
  EN: {
    appTagline: "A personal portfolio tracker that stays local.",
    nav: {
      dashboard: "Dashboard",
      holdings: "Holdings",
      transactions: "Transactions"
    },
    theme: {
      light: "Light",
      dark: "Dark"
    }
  }
};

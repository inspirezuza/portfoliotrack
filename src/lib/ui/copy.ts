import type { UiLanguage } from "@/lib/ui/translations";

const uiCopy = {
  TH: {
    shared: {
      all: "ทั้งหมด",
      add: "เพิ่ม",
      saved: "บันทึกแล้ว",
      search: "ค้นหา",
      waiting: "รอข้อมูล",
      noData: "ไม่มีข้อมูล",
      noCache: "ไม่มีแคช",
      noPositions: "ไม่มีสถานะลงทุน",
      noOpenPositions: "ไม่มีสถานะลงทุนที่เปิดอยู่",
      noTradesYet: "ยังไม่มีรายการซื้อขาย",
      mixed: "หลายสกุลเงิน",
      pending: "รอข้อมูล",
      sortAscending: "น้อยไปมาก",
      sortDescending: "มากไปน้อย",
      sortLabel: (label: string, direction: string) => `เรียง ${label} ${direction}`,
      countOf: (visible: number, total: number, unit: string) => `แสดง ${visible} จาก ${total} ${unit}`,
      positionCount: (count: number) => `${count} สถานะ`,
      transactionCount: (count: number) => `${count} รายการ`,
      separator: " / "
    },
    shell: {
      appTagline: "",
      mainNavigation: "เมนูหลัก",
      homeLabel: "PortfolioTrack หน้าแรก",
      primaryNavigation: "การนำทางหลัก",
      nav: {
        dashboard: "ภาพรวม",
        holdings: "หุ้นที่ถือ",
        transactions: "รายการซื้อขาย"
      },
      navShort: {
        dashboard: "ภาพ",
        holdings: "หุ้น",
        transactions: "ซื้อขาย"
      },
      language: "ภาษา",
      themeLabel: "ธีม",
      theme: {
        light: "สว่าง",
        dark: "มืด"
      }
    },
    dashboard: {
      workspace: "พื้นที่ทำงาน",
      title: "ภาพรวม",
      refreshPrices: "รีเฟรชราคา",
      portfolioSummary: "สรุปพอร์ต",
      portfolioValue: "มูลค่าพอร์ต",
      costBasis: "ต้นทุน",
      unrealizedPnl: "P&L ที่ยังไม่เกิดขึ้นจริง",
      realizedPnl: "P&L ที่เกิดขึ้นจริง",
      fees: "ค่าธรรมเนียม",
      vsCostBasis: "เทียบกับต้นทุน",
      closedTrades: "เทรดปิดแล้ว",
      allTransactions: "ทุกรายการ",
      openPositionsOnly: "เฉพาะสถานะที่เปิดอยู่",
      prices: "ราคา",
      coverage: "ความครอบคลุม",
      priced: "มีราคา",
      missing: "ขาดราคา",
      closed: "ปิดแล้ว",
      latestCache: "แคชล่าสุด",
      updateMarketData: "อัปเดตข้อมูลตลาด",
      holdings: "หุ้นที่ถือ",
      openPositions: "สถานะที่เปิดอยู่",
      viewAll: "ดูทั้งหมด",
      noPriceCache: "ไม่มีแคชราคา",
      stale: (age: string) => `เก่า ${age}`,
      age: {
        noCachedData: "ไม่มีข้อมูลแคช",
        justUpdated: "เพิ่งอัปเดต",
        minutesAgo: (minutes: number) => `${minutes} นาทีที่แล้ว`,
        hoursAgo: (hours: number) => `${hours} ชม.ที่แล้ว`
      },
      refresh: {
        quotesUpdated: (count: string) => `อัปเดต ${count} ราคา`,
        providerTimestamp: (timestamp: string) => `เวลา provider ${timestamp}`,
        symbolsNeedReview: (count: string) => `${count} symbols ยังต้องตรวจสอบ`,
        successTitle: "อัปเดตข้อมูลตลาดแล้ว",
        warningTitle: "อัปเดตข้อมูลตลาดแล้ว แต่มีคำเตือน",
        errorTitle: "รีเฟรชข้อมูลตลาดไม่สำเร็จ",
        fallbackErrorBody: "แดชบอร์ดยังใช้ราคาจากแคชล่าสุด"
      }
    },
    charts: {
      common: {
        timeframes: {
          "1D": "1D",
          "5D": "5D",
          "1W": "1W",
          "1M": "1M",
          "3M": "3M",
          YTD: "YTD",
          "1Y": "1Y",
          START: "เริ่มต้น",
          ALL: "ทั้งหมด"
        },
        dragToCompare: "ลากบนกราฟเพื่อเปรียบเทียบ",
        to: "ถึง",
        noChartData: "ไม่มีข้อมูลกราฟ",
        fromRangeStart: "จากจุดเริ่มช่วง",
        latest: "ล่าสุด",
        high: "สูงสุด",
        low: "ต่ำสุด",
        range: "ช่วง"
      },
      benchmark: {
        eyebrow: "ผลตอบแทน",
        titleDefault: "ผลตอบแทนเทียบ benchmark",
        titleWithSymbol: (symbol: string) => `ผลตอบแทนเทียบ ${symbol}`,
        performanceMode: "โหมดผลตอบแทน benchmark",
        timeframe: "ช่วงเวลาของกราฟ benchmark",
        rangeSummary: "สรุปช่วงเปรียบเทียบ benchmark",
        portfolio: "พอร์ต",
        benchmark: "Benchmark",
        latestGap: "Gap ล่าสุด",
        gap: "Gap",
        modes: {
          INDEXED: "Indexed",
          GAP: "Gap",
          DRAWDOWN: "Drawdown"
        },
        modeCopy: {
          INDEXED: {
            portfolioName: "พอร์ต",
            benchmarkName: "Benchmark",
            yAxisLabel: "Return"
          },
          GAP: {
            portfolioName: "Portfolio gap",
            benchmarkName: "Benchmark baseline",
            yAxisLabel: "Gap"
          },
          DRAWDOWN: {
            portfolioName: "Portfolio drawdown",
            benchmarkName: "Benchmark drawdown",
            yAxisLabel: "Drawdown"
          }
        },
        basis: {
          sameCurrencyFallback: "ผลตอบแทนสกุลเงินเดียวกัน",
          sameCurrency: (currency: string) => `ผลตอบแทน ${currency}`,
          nativeCurrencyFallback: "ผลตอบแทน benchmark ตามสกุลเงินต้นทาง",
          nativeCurrency: (currency: string) => `ผลตอบแทน benchmark ${currency}, เทียบเป็น %`,
          performanceReturn: "ผลตอบแทน"
        },
        unavailable: {
          noTransactions: "เพิ่มรายการซื้อขายเพื่อเริ่มกราฟ benchmark",
          mixedCurrency: "ปิดการเปรียบเทียบ benchmark เมื่อสถานะที่เปิดอยู่มีหลายสกุลเงิน",
          missingPortfolioHistory: "ประวัติราคาไม่ครบสำหรับหุ้นที่ถืออยู่",
          currencyMismatchFallback: "สกุลเงินของ benchmark ไม่ตรงกับสกุลเงินของพอร์ต",
          currencyMismatch: (symbol: string, currency: string) => `${symbol} ไม่ได้ quote เป็น ${currency}`,
          missingBenchmarkFallback: "ตั้งค่า benchmark เพื่อเปิดการเปรียบเทียบ",
          missingBenchmarkHistory: (symbol: string) => `ไม่มีประวัติราคาแคชสำหรับ ${symbol}`,
          default: "กราฟ benchmark ยังไม่พร้อมใช้งาน"
        }
      },
      portfolio: {
        eyebrow: "มูลค่าพอร์ต",
        title: "ประวัติมูลค่าพอร์ต",
        timeframe: "ช่วงเวลาของกราฟมูลค่าพอร์ต",
        rangeSummary: "สรุปช่วงมูลค่าพอร์ต",
        unavailable: {
          noTransactions: "เพิ่มรายการซื้อขายเพื่อเริ่มกราฟพอร์ต",
          mixedCurrency: "หยุดกราฟพอร์ตไว้เมื่อสถานะที่เปิดอยู่มีหลายสกุลเงิน",
          missingPortfolioHistory: "ประวัติราคาไม่ครบสำหรับหุ้นที่ถืออยู่",
          default: "ยังไม่มีข้อมูลกราฟพอร์ต"
        }
      }
    },
    holdings: {
      pageEyebrow: "หุ้นที่ถือ",
      pageTitle: "สถานะลงทุน",
      statusLabel: "สถานะหุ้นที่ถือ",
      open: "เปิด",
      priced: "มีราคา",
      missing: "ขาดราคา",
      latestCache: "แคชล่าสุด",
      table: {
        eyebrow: "หุ้นที่ถือ",
        title: "สถานะปัจจุบัน",
        toolsLabel: "เครื่องมือตารางหุ้นที่ถือ",
        filtersLabel: "ตัวกรองหุ้นที่ถือ",
        refreshPrices: "รีเฟรชราคา",
        refreshing: "กำลังรีเฟรช...",
        noOpenPositions: "ยังไม่มีสถานะลงทุนที่เปิดอยู่ เพิ่มรายการซื้อ แล้วหุ้นที่ถือจะแสดงที่นี่",
        searchPlaceholder: "Symbol, ชื่อ, ตลาด",
        positionsUnit: "สถานะ",
        noMatches: "ไม่มีสถานะที่ตรงกับตัวกรองปัจจุบัน",
        shownTotal: "รวมที่แสดง",
        noPriceYet: "ยังไม่มีราคา",
        noData: "ไม่มีข้อมูล",
        asOf: (date: string) => `ณ ${date}`,
        updatedWithIssues: (count: number) => `อัปเดตราคาแล้ว แต่ยังมี ${count} symbols ที่ต้องตรวจสอบ`,
        updatedPrices: (count: number) => `อัปเดต ${count} ราคาแล้ว`,
        refreshFailed: "รีเฟรชข้อมูลตลาดไม่สำเร็จ",
        filter: {
          all: "ทั้งหมด",
          gain: "กำไร",
          loss: "ขาดทุน",
          missing: "ขาดราคา"
        },
        columns: {
          symbol: "Symbol",
          quantity: "จำนวน",
          averageCost: "ต้นทุนเฉลี่ย",
          totalCost: "ต้นทุนรวม",
          lastPrice: "ราคาล่าสุด",
          marketValue: "มูลค่าตลาด",
          unrealizedPnl: "Unrealized P&L",
          weight: "น้ำหนัก"
        }
      },
      summary: {
        openPositions: "สถานะที่เปิดอยู่",
        openCostBasis: "ต้นทุนสถานะเปิด",
        marketValue: "มูลค่าตลาด",
        unrealizedPnl: "Unrealized P&L",
        realizedPnl: "Realized P&L",
        noOpenHoldings: "ยังไม่มีหุ้นที่ถืออยู่",
        openLedger: (count: number) => `${count} สถานะยังเปิดอยู่จากสมุดรายการซื้อขาย`,
        calculatedOpenOnly: "คำนวณจากสถานะที่เปิดอยู่เท่านั้น",
        usingCachedPrices: "ใช้ราคาแคช",
        usingCachedPricesAsOf: (date: string) => `ใช้ราคาแคช ณ ${date}`,
        openGainLoss: "กำไรหรือขาดทุนของสถานะเปิดเทียบกับต้นทุน",
        closedTradeResult: "ผลลัพธ์เทรดปิดถึงตอนนี้",
        waiting: "รอข้อมูล",
        waitingForPrice: "รอราคา",
        mixedCurrency: "หลายสกุลเงิน",
        currencyBreakdown: (currency: string, value: string) => `${currency}: ${value}`,
        priceCoverageNoOpen: "ยังไม่มีสถานะที่เปิดอยู่",
        priceCoverageFull: (count: number) => `ราคาแคชครอบคลุมครบทั้ง ${count} สถานะ`,
        priceCoverageFullAsOf: (count: number, date: string) => `ราคาแคชครอบคลุมครบทั้ง ${count} สถานะ ณ ${date}`,
        priceCoveragePartial: (priced: number, open: number, waiting: string) =>
          `${priced} จาก ${open} สถานะมีราคา; รอ ${waiting}`,
        moreSymbols: (count: number) => ` +${count} เพิ่มเติม`
      },
      allocation: {
        ariaLabel: "กราฟสัดส่วนหุ้นที่ถือ",
        other: "อื่น ๆ",
        positions: (count: number) => `${count} สถานะ`,
        ofHoldings: "ของหุ้นที่ถือ"
      }
    },
    transactions: {
      pageEyebrow: "Ledger",
      pageTitle: "รายการซื้อขาย",
      pageDescription: "บันทึกซื้อ ขาย และค่าธรรมเนียมโดยไม่ต้องเลือก instrument ไว้ก่อน",
      summaryLabel: "สรุปรายการซื้อขาย",
      recorded: "บันทึกแล้ว",
      traded: "ซื้อขาย",
      open: "เปิด",
      latest: "ล่าสุด",
      selectable: "เลือกได้",
      allInstruments: "เครื่องมือทั้งหมด",
      excel: {
        eyebrow: "Excel",
        title: "นำเข้า/ส่งออกรายการ",
        downloadTemplate: "ดาวน์โหลดเทมเพลต",
        exportLedger: "ส่งออก ledger",
        file: "ไฟล์ Excel",
        selectedFile: "ไฟล์ที่เลือก",
        preview: "พรีวิว",
        previewing: "กำลังพรีวิว...",
        importReady: "นำเข้าแถวที่พร้อม",
        importing: "กำลังนำเข้า...",
        previewSummary: "สรุปการนำเข้า Excel",
        total: "ทั้งหมด",
        ready: "พร้อม",
        skipped: "ข้าม",
        error: "ผิดพลาด",
        row: (rowNumber: number) => `แถว ${rowNumber}`,
        chooseFileFirst: "เลือกไฟล์ .xlsx ก่อน",
        importFailed: "นำเข้าไฟล์ Excel ไม่สำเร็จ",
        imported: (count: number) => `นำเข้า ${count} รายการแล้ว`
      },
      form: {
        editEyebrow: "แก้ไขรายการซื้อขาย",
        newEyebrow: "รายการซื้อขายใหม่",
        updateTitle: "อัปเดตรายการ",
        recordTitle: "บันทึกรายการ",
        instrument: "Instrument",
        instrumentHint: "ค้นหา instrument ที่บันทึกไว้ หรือเพิ่มใหม่",
        close: "ปิด",
        addInstrument: "เพิ่ม instrument",
        searchInstrument: "ค้นหา instrument",
        searchInstrumentPlaceholder: "พิมพ์ ASTS03, AAPL หรือชื่อบริษัท",
        searching: "กำลังค้นหา...",
        noMatchingInstruments: "ไม่พบ instrument ที่ตรงกัน",
        noInstruments: "ยังไม่มี instrument เพิ่ม instrument ก่อนบันทึกรายการซื้อขาย",
        chooseInstrument: "เลือก instrument",
        currentQuantity: (quantity: string) => `จำนวนปัจจุบัน: ${quantity} หน่วย`,
        selectBeforeSaving: "เลือก instrument ที่ตรงกันก่อนบันทึก",
        tradeDate: "วันที่ซื้อขาย",
        side: "ฝั่ง",
        buy: "Buy",
        sell: "Sell",
        quantity: "จำนวน",
        price: "ราคา",
        fee: "ค่าธรรมเนียม",
        notes: "โน้ต",
        notesPlaceholder: "โน้ตเพิ่มเติม เช่น broker, fill context หรือเหตุผลการซื้อขาย",
        cancelEdit: "ยกเลิกการแก้ไข",
        updating: "กำลังอัปเดต...",
        saving: "กำลังบันทึก...",
        refreshing: "กำลังรีเฟรช...",
        updateTransaction: "อัปเดตรายการ",
        saveTransaction: "บันทึกรายการ",
        couldNotSave: "บันทึกรายการไม่สำเร็จ",
        couldNotUpdate: "อัปเดตรายการไม่สำเร็จ",
        transactionUpdated: "อัปเดตรายการแล้ว",
        transactionSaved: "บันทึกรายการแล้ว",
        instrumentSearchUnavailable: "ค้นหา instrument ไม่พร้อมใช้งานตอนนี้",
        instrumentCouldNotSave: "บันทึก instrument ไม่สำเร็จ",
        addedAndSelected: (symbol: string) => `เพิ่มและเลือก ${symbol} แล้ว`,
        selected: (symbol: string) => `เลือก ${symbol} แล้ว`,
        insufficientQuantity: (quantity: string) => `จำนวนขายมากกว่าที่ถืออยู่ จำนวนสูงสุดที่ขายได้คือ ${quantity}`,
        saved: "บันทึกแล้ว",
        add: "เพิ่ม"
      },
      table: {
        eyebrow: "Ledger",
        title: "รายการล่าสุด",
        toolsLabel: "เครื่องมือตารางรายการซื้อขาย",
        noTransactions: "ยังไม่มีรายการซื้อขาย รายการแรกจะแสดงที่นี่ทันที",
        searchPlaceholder: "Symbol, วันที่, โน้ต",
        transactionsUnit: "รายการ",
        noMatches: "ไม่พบเทรดที่ตรงกับการค้นหาปัจจุบัน",
        deleteCouldNot: "ลบรายการไม่สำเร็จ",
        deleteConfirm: (side: string, quantity: string, symbol: string, date: string) =>
          `ลบ ${side} ${quantity} ${symbol} จากวันที่ ${date}?`,
        deleting: "กำลังลบ...",
        delete: "ลบ",
        edit: "แก้ไข",
        columns: {
          date: "วันที่",
          instrument: "Instrument",
          side: "ฝั่ง",
          quantity: "จำนวน",
          price: "ราคา",
          fee: "ค่าธรรมเนียม",
          net: "สุทธิ",
          notes: "โน้ต",
          actions: "จัดการ"
        }
      }
    }
  },
  EN: {
    shared: {
      all: "All",
      add: "Add",
      saved: "Saved",
      search: "Search",
      waiting: "Waiting",
      noData: "No data",
      noCache: "No cache",
      noPositions: "No positions",
      noOpenPositions: "No open positions",
      noTradesYet: "No trades yet",
      mixed: "Mixed",
      pending: "Pending",
      sortAscending: "ascending",
      sortDescending: "descending",
      sortLabel: (label: string, direction: string) => `Sort ${label} ${direction}`,
      countOf: (visible: number, total: number, unit: string) => `Showing ${visible} of ${total} ${unit}`,
      positionCount: (count: number) => `${count} positions`,
      transactionCount: (count: number) => `${count} transactions`,
      separator: " / "
    },
    shell: {
      appTagline: "",
      mainNavigation: "Main navigation",
      homeLabel: "PortfolioTrack home",
      primaryNavigation: "Primary",
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
    },
    dashboard: {
      workspace: "Workspace",
      title: "Dashboard",
      refreshPrices: "Refresh prices",
      portfolioSummary: "Portfolio summary",
      portfolioValue: "Portfolio value",
      costBasis: "Cost basis",
      unrealizedPnl: "Unrealized P&L",
      realizedPnl: "Realized P&L",
      fees: "Fees",
      vsCostBasis: "vs cost basis",
      closedTrades: "Closed trades",
      allTransactions: "All transactions",
      openPositionsOnly: "Open positions only",
      prices: "Prices",
      coverage: "Coverage",
      priced: "Priced",
      missing: "Missing",
      closed: "Closed",
      latestCache: "Latest cache",
      updateMarketData: "Update market data",
      holdings: "Holdings",
      openPositions: "Open positions",
      viewAll: "View all",
      noPriceCache: "No price cache",
      stale: (age: string) => `Stale ${age}`,
      age: {
        noCachedData: "No cached data",
        justUpdated: "Just updated",
        minutesAgo: (minutes: number) => `${minutes} min ago`,
        hoursAgo: (hours: number) => `${hours}h ago`
      },
      refresh: {
        quotesUpdated: (count: string) => `${count} quotes updated`,
        providerTimestamp: (timestamp: string) => `Provider timestamp ${timestamp}`,
        symbolsNeedReview: (count: string) => `${count} symbols still need review`,
        successTitle: "Market data updated",
        warningTitle: "Market data updated with warnings",
        errorTitle: "Market data refresh failed",
        fallbackErrorBody: "The dashboard is still using the latest cached prices."
      }
    },
    charts: {
      common: {
        timeframes: {
          "1D": "1D",
          "5D": "5D",
          "1W": "1W",
          "1M": "1M",
          "3M": "3M",
          YTD: "YTD",
          "1Y": "1Y",
          START: "Start",
          ALL: "All"
        },
        dragToCompare: "Drag across the chart to compare",
        to: "to",
        noChartData: "No chart data",
        fromRangeStart: "from range start",
        latest: "Latest",
        high: "High",
        low: "Low",
        range: "Range"
      },
      benchmark: {
        eyebrow: "Performance",
        titleDefault: "Performance vs benchmark",
        titleWithSymbol: (symbol: string) => `Performance vs ${symbol}`,
        performanceMode: "Benchmark performance mode",
        timeframe: "Benchmark chart timeframe",
        rangeSummary: "Benchmark comparison range summary",
        portfolio: "Portfolio",
        benchmark: "Benchmark",
        latestGap: "Latest gap",
        gap: "Gap",
        modes: {
          INDEXED: "Indexed",
          GAP: "Gap",
          DRAWDOWN: "Drawdown"
        },
        modeCopy: {
          INDEXED: {
            portfolioName: "Portfolio",
            benchmarkName: "Benchmark",
            yAxisLabel: "Return"
          },
          GAP: {
            portfolioName: "Portfolio gap",
            benchmarkName: "Benchmark baseline",
            yAxisLabel: "Gap"
          },
          DRAWDOWN: {
            portfolioName: "Portfolio drawdown",
            benchmarkName: "Benchmark drawdown",
            yAxisLabel: "Drawdown"
          }
        },
        basis: {
          sameCurrencyFallback: "Same-currency return",
          sameCurrency: (currency: string) => `${currency} return`,
          nativeCurrencyFallback: "Native-currency benchmark return",
          nativeCurrency: (currency: string) => `${currency} benchmark return, compared by %`,
          performanceReturn: "Performance return"
        },
        unavailable: {
          noTransactions: "Add a transaction to start the benchmark chart.",
          mixedCurrency: "Benchmark comparison is disabled for mixed open-position currencies.",
          missingPortfolioHistory: "Price history is incomplete for current holdings.",
          currencyMismatchFallback: "The benchmark currency does not match the portfolio currency.",
          currencyMismatch: (symbol: string, currency: string) => `${symbol} is not quoted in ${currency}.`,
          missingBenchmarkFallback: "Set a benchmark to enable comparison.",
          missingBenchmarkHistory: (symbol: string) => `No cached history for ${symbol}.`,
          default: "Benchmark chart is not available yet."
        }
      },
      portfolio: {
        eyebrow: "Portfolio value",
        title: "Portfolio value history",
        timeframe: "Portfolio chart timeframe",
        rangeSummary: "Portfolio value range summary",
        unavailable: {
          noTransactions: "Add a transaction to start the portfolio chart.",
          mixedCurrency: "Portfolio chart is paused for mixed open-position currencies.",
          missingPortfolioHistory: "Price history is incomplete for current holdings.",
          default: "No portfolio chart data yet."
        }
      }
    },
    holdings: {
      pageEyebrow: "Holdings",
      pageTitle: "Positions",
      statusLabel: "Holdings status",
      open: "Open",
      priced: "Priced",
      missing: "Missing",
      latestCache: "Latest cache",
      table: {
        eyebrow: "Holdings",
        title: "Current positions",
        toolsLabel: "Holdings table tools",
        filtersLabel: "Holdings filters",
        refreshPrices: "Refresh prices",
        refreshing: "Refreshing...",
        noOpenPositions: "No open positions yet. Add a buy transaction and holdings will appear here.",
        searchPlaceholder: "Symbol, name, market",
        positionsUnit: "positions",
        noMatches: "No positions match the current filters.",
        shownTotal: "Shown total",
        noPriceYet: "No price yet",
        noData: "No data",
        asOf: (date: string) => `as of ${date}`,
        updatedWithIssues: (count: number) => `Updated prices with ${count} symbols still needing review.`,
        updatedPrices: (count: number) => `Updated ${count} prices.`,
        refreshFailed: "Market data refresh failed.",
        filter: {
          all: "All",
          gain: "Gain",
          loss: "Loss",
          missing: "Missing price"
        },
        columns: {
          symbol: "Symbol",
          quantity: "Quantity",
          averageCost: "Average cost",
          totalCost: "Total cost",
          lastPrice: "Last price",
          marketValue: "Market value",
          unrealizedPnl: "Unrealized P&L",
          weight: "Weight"
        }
      },
      summary: {
        openPositions: "Open positions",
        openCostBasis: "Open cost basis",
        marketValue: "Market value",
        unrealizedPnl: "Unrealized P&L",
        realizedPnl: "Realized P&L",
        noOpenHoldings: "No open holdings yet",
        openLedger: (count: number) => `${count} positions are still open from the trade ledger`,
        calculatedOpenOnly: "Calculated from open positions only",
        usingCachedPrices: "Using cached prices",
        usingCachedPricesAsOf: (date: string) => `Using cached prices as of ${date}`,
        openGainLoss: "Open-position gain or loss versus cost",
        closedTradeResult: "Closed-trade result through now",
        waiting: "Waiting",
        waitingForPrice: "waiting for price",
        mixedCurrency: "Mixed currency",
        currencyBreakdown: (currency: string, value: string) => `${currency}: ${value}`,
        priceCoverageNoOpen: "No open positions yet",
        priceCoverageFull: (count: number) => `Cached prices cover all ${count} positions`,
        priceCoverageFullAsOf: (count: number, date: string) => `Cached prices cover all ${count} positions as of ${date}`,
        priceCoveragePartial: (priced: number, open: number, waiting: string) =>
          `${priced} of ${open} positions priced; waiting for ${waiting}`,
        moreSymbols: (count: number) => ` +${count} more`
      },
      allocation: {
        ariaLabel: "Holdings allocation chart",
        other: "Other",
        positions: (count: number) => `${count} positions`,
        ofHoldings: "of holdings"
      }
    },
    transactions: {
      pageEyebrow: "Ledger",
      pageTitle: "Transactions",
      pageDescription: "Record buys, sells, and fees without preselecting an instrument.",
      summaryLabel: "Transaction summary",
      recorded: "Recorded",
      traded: "Traded",
      open: "Open",
      latest: "Latest",
      selectable: "Selectable",
      allInstruments: "All instruments",
      excel: {
        eyebrow: "Excel",
        title: "Import / export transactions",
        downloadTemplate: "Download template",
        exportLedger: "Export ledger",
        file: "Excel file",
        selectedFile: "Selected file",
        preview: "Preview",
        previewing: "Previewing...",
        importReady: "Import ready rows",
        importing: "Importing...",
        previewSummary: "Excel import summary",
        total: "Total",
        ready: "Ready",
        skipped: "Skipped",
        error: "Errors",
        row: (rowNumber: number) => `Row ${rowNumber}`,
        chooseFileFirst: "Choose an .xlsx file first.",
        importFailed: "Excel import failed.",
        imported: (count: number) => `${count} transactions imported.`
      },
      form: {
        editEyebrow: "Edit transaction",
        newEyebrow: "New transaction",
        updateTitle: "Update trade",
        recordTitle: "Record trade",
        instrument: "Instrument",
        instrumentHint: "Search a saved instrument or add a new one.",
        close: "Close",
        addInstrument: "Add instrument",
        searchInstrument: "Search instrument",
        searchInstrumentPlaceholder: "Type ASTS03, AAPL, or a company name",
        searching: "Searching...",
        noMatchingInstruments: "No matching instruments",
        noInstruments: "No instruments are available. Add an instrument before recording trades.",
        chooseInstrument: "Choose an instrument",
        currentQuantity: (quantity: string) => `Current quantity: ${quantity} units`,
        selectBeforeSaving: "Select a matching instrument before saving.",
        tradeDate: "Trade date",
        side: "Side",
        buy: "Buy",
        sell: "Sell",
        quantity: "Quantity",
        price: "Price",
        fee: "Fee",
        notes: "Notes",
        notesPlaceholder: "Optional note, such as broker, fill context, or trade reason",
        cancelEdit: "Cancel edit",
        updating: "Updating...",
        saving: "Saving...",
        refreshing: "Refreshing...",
        updateTransaction: "Update transaction",
        saveTransaction: "Save transaction",
        couldNotSave: "Transaction could not be saved.",
        couldNotUpdate: "Transaction could not be updated.",
        transactionUpdated: "Transaction updated.",
        transactionSaved: "Transaction saved.",
        instrumentSearchUnavailable: "Instrument search is unavailable right now.",
        instrumentCouldNotSave: "Instrument could not be saved.",
        addedAndSelected: (symbol: string) => `${symbol} added and selected.`,
        selected: (symbol: string) => `${symbol} selected.`,
        insufficientQuantity: (quantity: string) =>
          `Sell quantity is greater than current holdings. Maximum sellable quantity is ${quantity}.`,
        saved: "Saved",
        add: "Add"
      },
      table: {
        eyebrow: "Ledger",
        title: "Latest transactions",
        toolsLabel: "Transaction table tools",
        noTransactions: "No transactions yet. The first recorded trade will appear here immediately.",
        searchPlaceholder: "Symbol, date, note",
        transactionsUnit: "transactions",
        noMatches: "No transactions match the current search.",
        deleteCouldNot: "Transaction could not be deleted.",
        deleteConfirm: (side: string, quantity: string, symbol: string, date: string) =>
          `Delete ${side} ${quantity} ${symbol} from ${date}?`,
        deleting: "Deleting...",
        delete: "Delete",
        edit: "Edit",
        columns: {
          date: "Date",
          instrument: "Instrument",
          side: "Side",
          quantity: "Quantity",
          price: "Price",
          fee: "Fee",
          net: "Net",
          notes: "Notes",
          actions: "Actions"
        }
      }
    }
  }
} as const;

export type UiCopy = (typeof uiCopy)[UiLanguage];

export function getUiCopy(language: UiLanguage): UiCopy {
  return uiCopy[language];
}

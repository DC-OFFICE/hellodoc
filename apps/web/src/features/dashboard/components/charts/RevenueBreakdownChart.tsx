import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface RevenueBreakdownChartProps {
  cash: string;
  card: string;
  bank: string;
  total: string;
}

export function RevenueBreakdownChart({ cash, card, bank, total }: RevenueBreakdownChartProps) {
  const cashNum = parseFloat(cash) || 0;
  const cardNum = parseFloat(card) || 0;
  const bankNum = parseFloat(bank) || 0;
  const totalNum = cashNum + cardNum + bankNum || 0.001;

  const cashPct = Math.round((cashNum / totalNum) * 100);
  const cardPct = Math.round((cardNum / totalNum) * 100);
  const bankPct = Math.max(0, 100 - cashPct - cardPct);

  // SVG Donut calculation (Circumference of r=60 is 2 * PI * 60 ~= 376.99)
  const radius = 60;
  const circumference = 2 * Math.PI * radius;

  const cashDash = (cashNum / totalNum) * circumference;
  const cardDash = (cardNum / totalNum) * circumference;
  const bankDash = (bankNum / totalNum) * circumference;

  const cashOffset = 0;
  const cardOffset = -cashDash;
  const bankOffset = -(cashDash + cardDash);

  return (
    <Card className="flex h-full flex-col shadow-xs">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Payment Channels</CardTitle>
        <CardDescription>Collection breakdown by settlement method</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-center pt-2">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Donut SVG */}
          <div className="relative flex size-44 items-center justify-center shrink-0">
            <svg className="size-full -rotate-90" viewBox="0 0 160 160">
              {/* Background circle */}
              <circle
                cx="80"
                cy="80"
                r={radius}
                className="stroke-muted"
                strokeWidth="18"
                fill="none"
              />
              {/* Cash segment */}
              {cashNum > 0 ? (
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  className="stroke-emerald-500 transition-all duration-700"
                  strokeWidth="18"
                  fill="none"
                  strokeDasharray={`${cashDash} ${circumference}`}
                  strokeDashoffset={cashOffset}
                />
              ) : null}
              {/* Card segment */}
              {cardNum > 0 ? (
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  className="stroke-teal-500 transition-all duration-700"
                  strokeWidth="18"
                  fill="none"
                  strokeDasharray={`${cardDash} ${circumference}`}
                  strokeDashoffset={cardOffset}
                />
              ) : null}
              {/* Bank segment */}
              {bankNum > 0 ? (
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  className="stroke-sky-500 transition-all duration-700"
                  strokeWidth="18"
                  fill="none"
                  strokeDasharray={`${bankDash} ${circumference}`}
                  strokeDashoffset={bankOffset}
                />
              ) : null}
            </svg>

            {/* Center Label */}
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                Total
              </span>
              <span className="text-sm font-bold text-foreground tabular-nums">
                LKR {total}
              </span>
            </div>
          </div>

          {/* Breakdown Legend List */}
          <div className="w-full space-y-3">
            {/* Cash item */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-emerald-500" />
                <span className="font-medium text-foreground">Cash</span>
              </div>
              <div className="text-right">
                <div className="font-semibold text-foreground tabular-nums">LKR {cash}</div>
                <div className="text-[11px] text-muted-foreground">{cashPct}%</div>
              </div>
            </div>

            {/* Card POS item */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-teal-500" />
                <span className="font-medium text-foreground">Card (POS)</span>
              </div>
              <div className="text-right">
                <div className="font-semibold text-foreground tabular-nums">LKR {card}</div>
                <div className="text-[11px] text-muted-foreground">{cardPct}%</div>
              </div>
            </div>

            {/* Bank Transfer item */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-sky-500" />
                <span className="font-medium text-foreground">Bank Transfer</span>
              </div>
              <div className="text-right">
                <div className="font-semibold text-foreground tabular-nums">LKR {bank}</div>
                <div className="text-[11px] text-muted-foreground">{bankPct}%</div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { Link } from 'react-router-dom';
import {
  CalendarClock,
  ChevronRight,
  FileText,
  Receipt,
  Stethoscope,
  Tag,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const QUICK_ACTIONS = [
  {
    title: 'Doctors',
    description: 'Manage doctor profiles and roster',
    to: '/doctors',
    icon: Stethoscope,
    color: 'text-teal-600 dark:text-teal-400 bg-teal-500/10',
  },
  {
    title: 'Consultation Sessions',
    description: 'Schedule sessions and view calendar',
    to: '/sessions',
    icon: CalendarClock,
    color: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
  },
  {
    title: 'Patient Directory',
    description: 'Search records and register patients',
    to: '/patients',
    icon: Users,
    color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10',
  },
  {
    title: 'Billing & Invoices',
    description: 'Issue bills and record collections',
    to: '/billing/invoices',
    icon: Receipt,
    color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  },
  {
    title: 'Services & Pricing',
    description: 'Maintain clinic consultation fees and items',
    to: '/services',
    icon: Tag,
    color: 'text-purple-600 dark:text-purple-400 bg-purple-500/10',
  },
  {
    title: 'Financial Reports',
    description: 'Audit daily cash registers and export data',
    to: '/billing/reports',
    icon: FileText,
    color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  },
];

export function DashboardRecentActivity() {
  return (
    <Card className="shadow-xs">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Clinic Management Hub</CardTitle>
        <CardDescription>Direct navigation to essential practice modules</CardDescription>
      </CardHeader>

      <CardContent className="pt-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.to}
                to={action.to}
                className="group flex items-center justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-primary/40 hover:bg-accent/40 hover:shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex size-9 items-center justify-center rounded-lg ${action.color}`}>
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                      {action.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

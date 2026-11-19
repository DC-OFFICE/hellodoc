import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarCheck2,
  CalendarClock,
  ChevronsUpDown,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings2,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useClinicAuth } from '@/lib/auth';

const managerNav = [
  { title: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, enabled: true },
  { title: 'Doctors', to: '/doctors', icon: Stethoscope, enabled: true },
  { title: 'Sessions', to: '/sessions', icon: CalendarClock, enabled: true },
  { title: 'Patients', to: '/patients', icon: Users, enabled: true },
  { title: 'Appointments', to: '/appointments', icon: CalendarCheck2, enabled: true },
  { title: 'SMS History', to: '/notifications', icon: Bell, enabled: true },
  { title: 'SMS Settings', to: '/settings/notifications', icon: Settings2, enabled: true },
  { title: 'Invoices', to: '/billing/invoices', icon: Receipt, enabled: true },
  { title: 'Billing reports', to: '/billing/reports', icon: Receipt, enabled: true },
  { title: 'Billing settings', to: '/settings/billing', icon: Settings2, enabled: true },
  { title: 'Account security', to: '/settings/security', icon: ShieldCheck, enabled: true },
] as const;

const doctorNav = [
  { title: 'Worklist', to: '/doctor/worklist', icon: Stethoscope, enabled: true },
  { title: 'Account security', to: '/settings/security', icon: ShieldCheck, enabled: true },
] as const;

const receptionistNav = [
  { title: 'Patients', to: '/patients', icon: Users, enabled: true },
  { title: 'Appointments', to: '/appointments', icon: CalendarCheck2, enabled: true },
  { title: 'Sessions', to: '/sessions', icon: CalendarClock, enabled: true },
  { title: 'Account security', to: '/settings/security', icon: ShieldCheck, enabled: true },
] as const;

const cashierNav = [
  { title: 'Invoices', to: '/billing/invoices', icon: Receipt, enabled: true },
  { title: 'Payments', to: '/billing/payments', icon: Receipt, enabled: true },
  { title: 'Billing reports', to: '/billing/reports', icon: Receipt, enabled: true },
  { title: 'Account security', to: '/settings/security', icon: ShieldCheck, enabled: true },
] as const;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function AppSidebar({ clinicName }: { clinicName?: string | null }) {
  const { user, logout } = useClinicAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const displayClinic = clinicName || user?.clinicName || 'Clinic workspace';
  const navItems =
    user?.role === 'clinic_doctor'
      ? doctorNav
      : user?.role === 'clinic_cashier'
        ? cashierNav
        : user?.role === 'clinic_receptionist'
          ? receptionistNav
          : managerNav;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex size-8 items-center justify-center rounded-lg bg-teal-700 text-white">
                <HeartPulse className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">HelloDoc</span>
                <span className="truncate text-xs text-muted-foreground">{displayClinic}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Clinic</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active =
                  item.enabled &&
                  (location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));
                return (
                  <SidebarMenuItem key={item.title}>
                    {item.enabled ? (
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                        <Link to={item.to}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton disabled tooltip={`${item.title} (coming soon)`}>
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-teal-100 text-teal-800">
                      {initials(user?.name ?? 'U')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user?.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-teal-100 text-teal-800">
                        {initials(user?.name ?? 'U')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user?.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await logout();
                    navigate('/login', { replace: true });
                  }}
                >
                  <LogOut />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

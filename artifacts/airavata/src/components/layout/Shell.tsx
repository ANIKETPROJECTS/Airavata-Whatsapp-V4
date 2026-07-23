import { createContext, useContext, useState, ReactNode } from 'react';
import { useLocation } from 'wouter';
import { 
  LayoutDashboard, MessageCircle, Users, Megaphone, BarChart3, 
  FileText, Settings, Workflow, Bot, Blocks, UsersRound, ShoppingBag, 
  CreditCard, Search, Bell, User, LogOut, ChevronRight, ChevronLeft,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import dashboardIcon from '@assets/dashboard_(2)_1784810137669.png';

const SIDEBAR_ITEMS = [
  { title: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { title: 'Live Chat', icon: MessageCircle, href: '/live-chat' },
  { title: 'Contacts', icon: Users, href: '/contacts' },
  { title: 'Create Campaign', icon: Megaphone, href: '/create-campaign' },
  { title: 'Campaigns Report', icon: BarChart3, href: '/campaigns-report' },
  { title: 'Add Template', icon: FileText, href: '/add-template' },
  { title: 'Manage Templates', icon: FileText, href: '/manage-templates' },
  { title: 'Flow Builder', icon: Workflow, href: '/flow-builder' },
  { title: 'Chatbot', icon: Bot, href: '/chatbot' },
  { title: 'Integration', icon: Blocks, href: '/integration' },
  { title: 'Group', icon: UsersRound, href: '/group' },
  { title: 'Catalogue', icon: ShoppingBag, href: '/catalogue' },
  { title: 'WA Pay', icon: CreditCard, href: '/wa-pay' },
  { title: 'Manage', icon: Settings, href: '/manage' },
];

// Expose collapsed state to pages so they can react if needed
export const SidebarContext = createContext<{ collapsed: boolean }>({ collapsed: false });
export const useSidebar = () => useContext(SidebarContext);

export function Shell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const handleNav = (href: string) => {
    setLocation(href);
  };

  const handleLogout = async () => {
    try {
      await logout();
      setLocation('/login');
      toast.success('Logged out successfully');
    } catch {
      toast.error('Logout failed');
    }
  };

  const currentItem = SIDEBAR_ITEMS.find(i => i.href === location) || SIDEBAR_ITEMS[0];

  return (
    <SidebarContext.Provider value={{ collapsed }}>
      <div className="flex h-screen bg-gray-50 text-slate-900 overflow-hidden">

        {/* Sidebar */}
        <aside
          className={`
            airavata-sidebar relative flex flex-col bg-[#FFD700] text-white
            transition-all duration-200 ease-in-out shrink-0 z-20
            ${collapsed ? 'w-16' : 'w-[220px]'}
          `}
        >
          {/* Logo */}
          <div className={`flex items-center border-b border-white/25 shrink-0 h-16 ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-4'}`}>
            <div className="w-9 h-9 rounded-md bg-white/20 flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            {!collapsed && (
              <span className="font-bold text-xl tracking-tight truncate">Airavata</span>
            )}
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto py-3">
            <ul className="space-y-1 px-2">
              {SIDEBAR_ITEMS.map((item) => {
                const isActive = location === item.href;
                return (
                  <li key={item.href}>
                    <button
                      onClick={() => handleNav(item.href)}
                      title={collapsed ? item.title : undefined}
                      className={`
                        w-full flex items-center rounded-lg text-[15px] font-semibold text-white transition-colors
                        ${collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5'}
                        ${isActive
                          ? 'bg-white/20 text-white'
                          : 'text-white hover:bg-white/15'
                        }
                      `}
                    >
                      {item.title === 'Dashboard' ? (
                        <img
                          src={dashboardIcon}
                          alt=""
                          aria-hidden="true"
                          className="w-5 h-5 shrink-0 object-contain brightness-0 invert"
                        />
                      ) : (
                        <item.icon className="w-5 h-5 shrink-0 text-white" />
                      )}
                      {!collapsed && <span className="truncate">{item.title}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Bottom: user + sign out */}
          <div className={`border-t border-white/25 py-3 space-y-1 px-2 shrink-0`}>
            <button
              onClick={() => handleNav('/profile')}
              title={collapsed ? (user?.businessName ?? 'Profile') : undefined}
              className={`
                w-full flex items-center rounded-lg text-[15px] font-semibold text-white transition-colors
                ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-2 py-2'}
                ${location === '/profile'
                  ? 'bg-white/20 text-white'
                  : 'text-white hover:bg-white/15'
                }
              `}
            >
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-white" />
              </div>
              {!collapsed && (
                <div className="flex-1 text-left min-w-0">
                  <div className="text-[13px] font-semibold truncate leading-tight">{user?.businessName ?? '—'}</div>
                  <div className="text-[11px] text-white truncate leading-tight">{user?.email ?? ''}</div>
                </div>
              )}
            </button>

            <button
              onClick={handleLogout}
              title={collapsed ? 'Sign out' : undefined}
              className={`
                w-full flex items-center rounded-lg text-sm font-medium transition-colors
                text-white hover:bg-white/15
                ${collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5'}
              `}
            >
              <LogOut className="w-5 h-5 shrink-0 text-white" />
              {!collapsed && <span className="text-[15px] font-semibold">Sign out</span>}
            </button>
          </div>

          {/* Collapse toggle button — pinned to right edge */}
          <button
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="absolute -right-3 top-[52px] w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:shadow-md hover:border-primary/40 transition-all z-30 text-gray-500 hover:text-primary"
          >
            {collapsed
              ? <ChevronRight className="w-3 h-3" />
              : <ChevronLeft className="w-3 h-3" />
            }
          </button>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Topbar */}
          <header className="h-14 bg-white border-b flex items-center justify-between px-4 z-10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center text-sm text-gray-500">
                <span className="text-gray-400">Airavata</span>
                <ChevronRight className="w-4 h-4 mx-1 text-gray-300" />
                <span className="font-semibold text-gray-800">{currentItem?.title || 'Profile'}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative hidden sm:block">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="pl-8 pr-4 py-1.5 text-sm bg-gray-100 border-transparent rounded-full focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all w-56"
                />
              </div>

              <button className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-white" />
              </button>
            </div>
          </header>

          {/* Page content — pages manage their own overflow */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {children}
          </div>
        </main>

        {/* Floating Chat Widget */}
        <div className="fixed bottom-6 right-6 z-50">
          <button className="w-12 h-12 bg-primary text-white rounded-full shadow-lg flex items-center justify-center hover:bg-primary/90 transition-transform hover:scale-105">
            <MessageCircle className="w-5 h-5" />
          </button>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useLocation } from 'wouter';
import { 
  LayoutDashboard, MessageCircle, Users, Megaphone, BarChart3, 
  FileText, Settings, Workflow, Bot, Blocks, UsersRound, ShoppingBag, 
  CreditCard, ChevronRight, ChevronLeft,
  PanelLeftClose, PanelLeftOpen, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import dashboardIcon from '@assets/dashboard_(2)_1787117667340.png';
import chatBubblesIcon from '@assets/comment_1787117439589.png';
import contactsIcon from '@assets/contact-us_(1)_1787117484074.png';
import marketingIcon from '@assets/megaphone_1787117798424.png';
import reportIcon from '@assets/dashboard_(3)_1784831703621.png';
import widgetIcon from '@assets/table_1784821548409.png';
import docsIcon from '@assets/docs_1784814701440.png';
import flowChartIcon from '@assets/flow-chart_1784814816750.png';
import botIcon from '@assets/bot_1784814891252.png';
import skillDevelopmentIcon from '@assets/link_1784832510109.png';
import multipleUsersIcon from '@assets/people_(1)_1784832278623.png';
import catalogIcon from '@assets/catalog_1784815184631.png';
import creditCardIcon from '@assets/credit-card_(1)_1784832045706.png';
import settingsIcon from '@assets/settings_(1)_1784831863555.png';
import logoIcon from '@assets/ICON_NOBG.svg';
import fullLogo from '@assets/HFULL_NOBGSVG.svg';
import supportIcon from '@assets/support_1787151920696.png';
import indiaIcon from '@assets/world_1787152034254.png';

const SIDEBAR_ITEMS = [
  { title: 'Dashboard', icon: LayoutDashboard, iconSrc: dashboardIcon, href: '/dashboard' },
  { title: 'Live Chat', icon: MessageCircle, iconSrc: chatBubblesIcon, href: '/live-chat' },
  { title: 'Contacts', icon: Users, iconSrc: contactsIcon, href: '/contacts' },
  { title: 'Create Campaign', icon: Megaphone, iconSrc: marketingIcon, href: '/create-campaign' },
  { title: 'Campaigns Report', icon: BarChart3, iconSrc: reportIcon, href: '/campaigns-report' },
  { title: 'Add Template', icon: FileText, iconSrc: widgetIcon, href: '/add-template' },
  { title: 'Manage Templates', icon: FileText, iconSrc: docsIcon, href: '/manage-templates' },
  { title: 'Flow Builder', icon: Workflow, iconSrc: flowChartIcon, href: '/flow-builder' },
  { title: 'Chatbot', icon: Bot, iconSrc: botIcon, href: '/chatbot' },
  { title: 'Integration', icon: Blocks, iconSrc: skillDevelopmentIcon, href: '/integration' },
  { title: 'Group', icon: UsersRound, iconSrc: multipleUsersIcon, href: '/group' },
  { title: 'Catalogue', icon: ShoppingBag, iconSrc: catalogIcon, href: '/catalogue' },
  { title: 'WA Pay', icon: CreditCard, iconSrc: creditCardIcon, href: '/wa-pay' },
  { title: 'Manage', icon: Settings, iconSrc: settingsIcon, href: '/manage' },
  { title: 'Admin', icon: ShieldCheck, href: '/admin', adminOnly: true },
];

// Expose collapsed state to pages so they can react if needed
export const SidebarContext = createContext<{ collapsed: boolean }>({ collapsed: false });
export const useSidebar = () => useContext(SidebarContext);

export function Shell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [location, setLocation] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleNav = (href: string) => {
    setLocation(href);
  };

  const visibleSidebarItems = SIDEBAR_ITEMS.filter(
    item => !('adminOnly' in item) || !item.adminOnly || user?.role === 'admin',
  );
  const currentItem = visibleSidebarItems.find(i => i.href === location) || visibleSidebarItems[0];

  return (
    <SidebarContext.Provider value={{ collapsed }}>
      <div className="flex h-screen bg-gray-50 text-slate-900 overflow-hidden">

        {/* Sidebar */}
        <aside
          className={`
            airavata-sidebar relative flex flex-col bg-[#25d366] text-black
            transition-all duration-200 ease-in-out shrink-0 z-20
            ${collapsed ? 'w-20' : 'w-[260px]'}
          `}
        >
          {/* Logo */}
          <div className="relative flex items-center justify-center bg-[#25d366] shrink-0 h-16 px-2">
            <div className={`flex items-center justify-center bg-white shadow-sm overflow-hidden rounded-none ${collapsed ? 'w-full h-14 p-1.5' : 'w-full h-14 px-2'}`}>
              <img
                src={collapsed ? logoIcon : fullLogo}
                alt="Airavata"
                className={collapsed ? 'w-12 h-12 object-contain' : 'w-full h-14 object-cover object-center'}
              />
            </div>
            <div className="absolute bottom-[-5px] left-2 right-2 h-px bg-white" aria-hidden="true" />
          </div>

          {/* Nav items */}
          <nav className="airavata-sidebar-nav flex-1 overflow-y-auto py-3">
            <ul className="space-y-1 px-2">
              {visibleSidebarItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <li key={item.href}>
                    <button
                      onClick={() => handleNav(item.href)}
                      title={collapsed ? item.title : undefined}
                      className={`
                        w-full flex items-center rounded-none text-[16px] font-semibold text-black transition-colors
                        ${collapsed ? 'justify-center px-0 py-3.5' : 'gap-3.5 px-3.5 py-3'}
                        bg-white text-black hover:bg-white border-2
                        ${isActive ? 'border-black' : 'border-transparent'}
                      `}
                    >
                      {item.iconSrc ? (
                        <img
                          src={item.iconSrc}
                          alt=""
                          aria-hidden="true"
                          className="w-8 h-8 shrink-0 object-contain brightness-0"
                        />
                      ) : (
                        <item.icon className="w-6 h-6 shrink-0 text-black" />
                      )}
                      {!collapsed && <span className="truncate">{item.title}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Collapse toggle button — pinned to right edge */}
          <button
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="absolute -right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white border border-black rounded-full flex items-center justify-center shadow-sm hover:shadow-md hover:border-black transition-all z-30 text-black hover:text-black"
          >
            {collapsed
              ? <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
              : <ChevronLeft className="w-3.5 h-3.5 stroke-[2.5]" />
            }
          </button>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Topbar */}
          <header className="h-[60px] bg-white border-b flex items-center justify-between px-4 z-10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center text-sm text-gray-500">
                <span className="text-xl font-semibold text-gray-900">{currentItem?.title || 'Profile'}</span>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="hidden sm:block w-[136px] text-left leading-tight whitespace-nowrap">
                <div className="text-[13px] font-medium text-black">
                  {currentTime.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                  {', '}
                  {currentTime.toLocaleDateString('en-IN', { weekday: 'short' })}
                </div>
                <div className="mt-1 text-[13px] font-medium text-black tabular-nums">
                  {currentTime.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true,
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2.5 border-l border-black pl-5">
                <img
                  src={supportIcon}
                  alt=""
                  aria-hidden="true"
                  className="w-8 h-8 object-contain"
                />
                <div className="leading-tight whitespace-nowrap">
                  <div className="text-[13px] font-medium text-black">support@atwassup.com</div>
                  <div className="mt-1 text-[13px] font-medium text-black">+91 9167959756</div>
                </div>
              </div>
              <div className="flex items-center border-l border-black pl-5">
                <img
                  src={indiaIcon}
                  alt="India"
                  className="w-10 h-10 object-contain"
                />
              </div>
            </div>
          </header>

          {/* Page content — pages manage their own overflow */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto overflow-x-hidden">
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

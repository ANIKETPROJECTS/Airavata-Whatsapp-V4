import { createContext, useContext, useState, ReactNode } from 'react';
import { useLocation } from 'wouter';
import { 
  LayoutDashboard, MessageCircle, Users, Megaphone, BarChart3, 
  FileText, Settings, Workflow, Bot, Blocks, UsersRound, ShoppingBag, 
  CreditCard, Menu, Search, Bell, User, LogOut, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

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

export function Shell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const handleNav = (href: string) => {
    setLocation(href);
    setSidebarOpen(false);
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
    <div className="flex h-screen bg-gray-50 text-slate-900 overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground 
        transform transition-transform duration-200 ease-in-out flex flex-col
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-md bg-sidebar-primary flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <span className="font-semibold text-lg tracking-tight">Airavata</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {SIDEBAR_ITEMS.map((item) => (
              <li key={item.href}>
                <button
                  onClick={() => handleNav(item.href)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location === item.href 
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground' 
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-1">
          <button 
            onClick={() => handleNav('/profile')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              location === '/profile'
                ? 'bg-sidebar-primary text-sidebar-primary-foreground' 
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="text-sm font-medium truncate">{user?.businessName ?? '—'}</div>
              <div className="text-xs text-sidebar-foreground/60 truncate">{user?.email ?? ''}</div>
            </div>
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 bg-white border-b flex items-center justify-between px-4 lg:px-6 z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-md"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <div className="hidden md:flex items-center text-sm text-gray-500">
              <span>Airavata</span>
              <ChevronRight className="w-4 h-4 mx-1" />
              <span className="font-medium text-gray-900">{currentItem?.title || 'Profile'}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="pl-9 pr-4 py-1.5 text-sm bg-gray-100 border-transparent rounded-full focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all w-64"
              />
            </div>
            
            <button className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>

      {/* Floating Chat Widget */}
      <div className="fixed bottom-6 right-6 z-50">
        <button className="w-14 h-14 bg-primary text-white rounded-full shadow-lg flex items-center justify-center hover:bg-primary/90 transition-transform hover:scale-105">
          <MessageCircle className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

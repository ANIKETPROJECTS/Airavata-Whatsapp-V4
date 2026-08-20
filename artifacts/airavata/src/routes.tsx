import { Shell } from './components/layout/Shell';
import Dashboard from './pages/Dashboard';
import LiveChat from './pages/LiveChat';
import Contacts from './pages/Contacts';
import CreateCampaign from './pages/CreateCampaign';
import CampaignsReport from './pages/CampaignsReport';
import ManageTemplates from './pages/ManageTemplates';
import AddTemplate from './pages/AddTemplate';
import FlowBuilder from './pages/FlowBuilder';
import Chatbot from './pages/Chatbot';
import Integration from './pages/Integration';
import Group from './pages/Group';
import Catalogue from './pages/Catalogue';
import WAPay from './pages/WAPay';
import Credits from './pages/Credits';
import Manage from './pages/Manage';
import Profile from './pages/Profile';
import Admin from './pages/Admin';

export const routes = [
  { path: '/dashboard', component: Dashboard },
  { path: '/live-chat', component: LiveChat },
  { path: '/contacts', component: Contacts },
  { path: '/create-campaign', component: CreateCampaign },
  { path: '/campaigns-report', component: CampaignsReport },
  { path: '/add-template', component: AddTemplate },
  { path: '/manage-templates', component: ManageTemplates },
  { path: '/flow-builder', component: FlowBuilder },
  { path: '/chatbot', component: Chatbot },
  { path: '/integration', component: Integration },
  { path: '/group', component: Group },
  { path: '/catalogue', component: Catalogue },
  { path: '/wa-pay', component: WAPay },
  { path: '/credits', component: Credits },
  { path: '/manage', component: Manage },
  { path: '/profile', component: Profile },
  { path: '/admin', component: Admin },
];

import { Home } from './Home';
import { QueensGame } from './queens/ui/QueensGame';
import { route } from './shared/settings';
import { SortGame } from './sort/ui/SortGame';
import { MobGame } from './mob/ui/MobGame';

export function App() {
  switch (route.value) {
    case 'queens':
      return <QueensGame />;
    case 'sort':
      return <SortGame />;
    case 'mob':
      return <MobGame />;
    default:
      return <Home />;
  }
}

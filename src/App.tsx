import { Home } from './Home';
import { QueensGame } from './queens/ui/QueensGame';
import { route } from './shared/settings';
import { SortGame } from './sort/ui/SortGame';

export function App() {
  switch (route.value) {
    case 'queens':
      return <QueensGame />;
    case 'sort':
      return <SortGame />;
    default:
      return <Home />;
  }
}

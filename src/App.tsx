import { Home } from './Home';
import { QueensGame } from './queens/ui/QueensGame';
import { route } from './shared/settings';
import { SortGame } from './sort/ui/SortGame';
import { MobGame } from './mob/ui/MobGame';

// Esc returns to the home screen from any game (handy on desktop).
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && route.value !== 'home' && !document.querySelector('[role="dialog"].sheet')) {
      route.value = 'home';
    }
  });
}

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

import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { initHaptics } from './shared/haptics';
import { preventZoom } from './shared/noZoom';
import './styles.css';

preventZoom();
initHaptics();
render(<App />, document.getElementById('app')!);
registerSW({ immediate: true });

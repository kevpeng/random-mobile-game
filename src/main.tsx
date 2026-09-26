import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { preventZoom } from './shared/noZoom';
import './styles.css';

preventZoom();
render(<App />, document.getElementById('app')!);
registerSW({ immediate: true });

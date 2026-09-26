import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './styles.css';

render(<App />, document.getElementById('app')!);
registerSW({ immediate: true });

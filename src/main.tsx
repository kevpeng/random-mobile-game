import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { restoreOrStart } from './state/store';
import { App } from './ui/App';
import './styles.css';

restoreOrStart();
render(<App />, document.getElementById('app')!);
registerSW({ immediate: true });

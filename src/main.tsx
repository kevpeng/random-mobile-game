import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { QueensGame } from './queens/ui/QueensGame';
import './styles.css';

render(<QueensGame />, document.getElementById('app')!);
registerSW({ immediate: true });

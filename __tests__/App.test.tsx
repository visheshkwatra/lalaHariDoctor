/**
 * Smoke test: App (navigator + splash) renders without crashing.
 * Native modules are mocked in jest.setup.js.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

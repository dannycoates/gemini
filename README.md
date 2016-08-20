# testpilot (gemini)

A minimal proof-of-concept static site.

## Setup

- `npm install`
- Create a host entry in `/etc/hosts`
  - `127.0.0.1 testpilot.dev`
- `npm start`
- If the testpilot addon is installed change about:config
  - `testpilot.env local`
- browse to http://testpilot.dev:8000

## Notes

This builds upon the [experiment.json PR](https://github.com/mozilla/testpilot/pull/1268) and includes only the `frontend/static-src`, `legal-copy` and `locales` files necessary to build a navigable static site.

The `index.html` was downloaded from the dev server and hand modified to correct some pathnames.

The site gets built into the `/dist` directory.

It's functional and works with the addon, but a couple things are broken:
- requests to the installation url fail, i.e. `/api/experiments/2/installation...`
- requests to individual experiment json files fail, like `/api/experiments/2`
  - this happens on experiment enable/disable but with no visible effect

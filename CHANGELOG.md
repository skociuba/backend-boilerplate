# Changelog

## [1.1.3](https://github.com/skociuba/backend-boilerplate/compare/v1.1.2...v1.1.3) (2026-11-17)


### Bug Fixes

* keep an empty request body as {} under express 5 ([43e3099](https://github.com/skociuba/backend-boilerplate/commit/43e30991ca3f54312d4231b35b525795c315da57))

## [1.1.2](https://github.com/skociuba/backend-boilerplate/compare/v1.1.1...v1.1.2) (2026-11-17)


### Bug Fixes

* **deps:** patch vulnerable dependencies and upgrade zod to v4 ([6b80fc4](https://github.com/skociuba/backend-boilerplate/commit/6b80fc48c61d4d63acbf2ff7df89b0e8cc7e8869))


### CI/CD

* audit dependencies, scan the image with trivy and enable dependabot ([2bcbe74](https://github.com/skociuba/backend-boilerplate/commit/2bcbe7492e91da8edf81aaca51e42e79a0359f86))
* bump the actions group across 1 directory with 9 updates ([9c4d881](https://github.com/skociuba/backend-boilerplate/commit/9c4d8812a788f7fe7351054cc6464b6c44d6ee64))
* bump the actions group across 1 directory with 9 updates ([578debe](https://github.com/skociuba/backend-boilerplate/commit/578debe91e9539391bf6fcd3d6a48b98abffbd7e))
* **dependabot:** skip major updates of typescript, @types/node and node ([774a599](https://github.com/skociuba/backend-boilerplate/commit/774a5996b5fe79391dd885a73d769b8977ed902c))
* **dependabot:** skip major updates of typescript, @types/node and node ([73e9696](https://github.com/skociuba/backend-boilerplate/commit/73e96962949a75f8cbfd04b0f9118afad010a3fa))

## [1.1.1](https://github.com/skociuba/backend-boilerplate/compare/v1.1.0...v1.1.1) (2026-11-16)


### CI/CD

* deploy to production only from releases ([7a61dfc](https://github.com/skociuba/backend-boilerplate/commit/7a61dfc307c6fc38dda9e1103c1634f7d27765d2))
* deploy to production only from releases ([2842afe](https://github.com/skociuba/backend-boilerplate/commit/2842afe9a94629ccd43c4d8100445d0761cc76f5))

## [1.1.0](https://github.com/skociuba/backend-boilerplate/compare/v1.0.0...v1.1.0) (2026-11-16)


### Features

* add a script to grant or revoke the admin role ([6f12d34](https://github.com/skociuba/backend-boilerplate/commit/6f12d345f4888860ac09aa147fced895a4d0d07f))
* add a script to grant or revoke the admin role ([b133bc2](https://github.com/skociuba/backend-boilerplate/commit/b133bc2b3a279202d2e9f54ae4be9110126b7fa3))
* **deploy:** health check for the api and a rollback that works on c… ([efe6fa6](https://github.com/skociuba/backend-boilerplate/commit/efe6fa69fb5b6f198ea7bc7adf7232f8787561f5))
* **deploy:** health check for the api and a rollback that works on compose v1 ([21a7bf7](https://github.com/skociuba/backend-boilerplate/commit/21a7bf79b99bf6f54d6e5471c759696cb2b45532))
* **posts:** optional image per post ([5c68adf](https://github.com/skociuba/backend-boilerplate/commit/5c68adf0c8ec5e74f3099cd4ac1e8b235acd978e))
* **posts:** optional image per post ([39eebb6](https://github.com/skociuba/backend-boilerplate/commit/39eebb6890a095c4dfd5a986c2759b102bc1867e))
* **posts:** paginate, sort and filter the public feed ([8f666d0](https://github.com/skociuba/backend-boilerplate/commit/8f666d0843dda9e8cc38c5289c587f6c707b0cc3))
* **profile:** drop pesel and let users edit their name ([e84e488](https://github.com/skociuba/backend-boilerplate/commit/e84e488aecb041e4ca152387bd1c91b621427cb1))


### Bug Fixes

* **deploy:** expose the api only to nginx on the server ([20c6a53](https://github.com/skociuba/backend-boilerplate/commit/20c6a539f4401e06b2d18702081f5318ceac40e4))
* **deploy:** expose the api only to nginx on the server ([ad5eed5](https://github.com/skociuba/backend-boilerplate/commit/ad5eed54b527e548b8564f2215f9a6a7039151f2))
* **deploy:** read only the db keys from .env in the backup script ([3acdf8c](https://github.com/skociuba/backend-boilerplate/commit/3acdf8cf7591c9c73928fa1076686dd60071281e))
* **deploy:** read only the db keys from .env in the backup script ([261f153](https://github.com/skociuba/backend-boilerplate/commit/261f1535a85ca24f8b3f30ff1f730217da1f0a19))
* **mail:** send a text part and log every sent message ([d00cdd0](https://github.com/skociuba/backend-boilerplate/commit/d00cdd035053359bfa14a8fe356329a9ba54c2ac))
* **mail:** send a text part and log every sent message ([a470e57](https://github.com/skociuba/backend-boilerplate/commit/a470e57070c437294d27d786b212c27b26dfa1c6))


### CI/CD

* check pull requests before merge and update actions ([79c73f6](https://github.com/skociuba/backend-boilerplate/commit/79c73f6bd5a091e65af15556e2a6873e752efc3c))
* check pull requests before merge and update actions ([075e25e](https://github.com/skociuba/backend-boilerplate/commit/075e25e0aa381d30429711147b33b5a2bfc0507f))
* versioned releases with release-please and image version tags ([0f7cc48](https://github.com/skociuba/backend-boilerplate/commit/0f7cc486009ce4e0222e4ba29c089b1b2c2b83bd))
* versioned releases with release-please and image version tags ([38b50b8](https://github.com/skociuba/backend-boilerplate/commit/38b50b8abb19bb83c39885a3495165cfe145f982))


### Tests

* integration tests against a real postgres in ci ([6c70774](https://github.com/skociuba/backend-boilerplate/commit/6c707747477b2e1d4f7cc5085e57435656f387bf))
* integration tests against a real postgres in ci ([b21351f](https://github.com/skociuba/backend-boilerplate/commit/b21351fa01cf65bfc407bb9fd42612e3b20c7f29))

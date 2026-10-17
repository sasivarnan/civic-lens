# Local demo image

`road-damage.jpg` is a test image. It shows a pothole in County Monaghan, Ireland, on 8 June 2020. It does not show a current Bengaluru incident.

- Author: Computerfan0.
- Source: [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Pothole_on_local_Road_in_County_Monaghan.jpg).
- Licence: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- Changes: orientation correction, size reduction, JPEG encoding, and metadata removal.

The inspected image has no visible people or number plates. Review the file before each demonstration. Use an explicit test description and a demo title. Any Bengaluru point used with this image is a test point, not the photo location. Hide the test report after the demonstration.

Run the full local API check with the app and services running:

```sh
TEST_IMAGE="$PWD/fixtures/road-damage.jpg" pnpm --filter @civiclens/backend test:smoke
```

The check uses real model services. Hosted reviews wait at least five seconds before each request. Run one check process at a time. Browser reviews also use the project allowance. It can fail when those services are unavailable. It hides its test report after all checks pass. If a later check fails after publication, use the local Admin account to hide the report.

# MMM-IsraelNews

MMM-IsraelNews is a MagicMirror module that displays the latest news headlines from Israel in Hebrew. It fetches news from an RSS feed and presents it in a customizable scrolling ticker format.

## Features

- Fetches news headlines from an Israeli news RSS feed.
- Customizable number of displayed headlines (default is 6).
- Vertical scrolling for headlines exceeding the display limit.
- Easy integration with the MagicMirror framework.

## Installation

1. Navigate to the `modules` directory of your MagicMirror installation.
2. Clone this repository into the `MMM-IsraelNews` folder:

   git clone https://github.com/yourusername/MMM-IsraelNews.git

3. Navigate into the `MMM-IsraelNews` directory:

   cd MMM-IsraelNews

4. Install the required dependencies:

   npm install

## Configuration

Add the following configuration to your `config/config.js` file:

```javascript
{
  module: 'MMM-IsraelNews',
  position: 'top_bar', // Position where the module will be displayed
  config: {
    rssFeed: 'https://www.ynet.co.il/Integration/StoryRss1854.xml', // RSS feed URL
    displayLines: 6, // Number of lines to display
    scroll: true // Enable scrolling
  }
}
```

## Usage

Once installed and configured, the MMM-IsraelNews module will automatically fetch and display the latest news headlines. You can adjust the `displayLines` option in the configuration to change how many headlines are shown at once.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
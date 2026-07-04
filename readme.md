## Features

* **Interactive File Manager**: Navigate your Android storage with support for symbolic links, file inspection, and directory traversal.
* **System Monitoring**: Real-time stats for CPU, RAM, and Disk usage (with responsive bar graphs).
* **Theme Engine**: Customizable color palettes (GPT, Claude, Sakura, Rose, Rain) with persistent storage.
* **Responsive UI**: Intelligent text truncation and adaptive layout for mobile terminal widths.
* **Keyboard Navigation**: Built for Termux, optimized for the "Extra Keys" row.

## Setup Requirements

1.  **Termux**: Ensure you have Termux installed on your Android device.
2.  **Node.js**: Install Node.js in Termux:
    ```bash
    pkg install nodejs
    ```
3.  **Storage Access**: To access your phone's folders, run:
    ```bash
    termux-setup-storage
    ```

## Installation & Running

1.  **Clone the repository**:
    ```bash
    git clone <your-repo-url>
    cd TermucCliDesktop
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Build and Run**:
    ```bash
    npm run build
    node dist/cli.js
    ```

## Configuration (Optimizing for Termux)

To get the best experience, add the **ENTER** key to your Termux extra-keys:

1. Edit your properties: `nano ~/.termux/termux.properties`
2. Update the `extra-keys` line:
   ```properties
   extra-keys = [['ESC','/','-','HOME','UP','END','PGUP'], \
                 ['TAB','CTRL','ALT','LEFT','DOWN','RIGHT','PGDN','ENTER']]
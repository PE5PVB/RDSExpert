# RDSExpert Changelog

--- 14/02/2026 ---
- Bandscan export: Added a delay of 2 seconds before an RDS is considered as "storable" to prevent RDS data from being logged for a previous frequency.
- Empty PS messages are now detected and stored in the PS history.
- Detailed data/Bandscan export: Added empty Radiotext recognition. If a station doesn't send text but a technical code such as <0D>, the RT will be displayed as is.
- Added user's preferences storage in the web browser (using localStorage). For example, if the user enables underscores on PS/RT, they will appear at the next session.
- Added an "information" icon. Clicking it will redirect the user to the decoder's documentation on GitHub (Wiki) via a new tab.
- TMC decoder: Added provider name, decoded from Group 8A.
- Added Radiotext technical codes (e.g. <0D>) to the Radiotext history on the interface and in the TXT export.
- Added a tooltip to each RT line to indicate the maximum number of characters that can be sent depending on the group used, 2A or 2B ("32 char." / "64 char.")
- Added EID and Channel info in the ODA's section of the PDF/TXT exports when the DAB Cross-Referencing ODA is detected.

--- 11/02/2026 ---
- Radiotext codes (e.g. <0D>) are now displayed in the PDF exports.
- Added TP, TA and PTY values to the PDF's EON section, in addition to the AF and Mapped Frequencies that were already included.
- Added an error message if the webserver API cannot be contacted when starting a bandscan.

--- 01/02/2026 ---
- Bandscan/Detailed data export: Added dBf to dBuV conversion in the export-preview modal.
- Bandscan/Detailed data export: Added dynamic PS messages display in the main PS field, limited to 14 messages.
- Bandscan/Detailed data export: Added purple color to the PS field for stations using a dynamic PS in the stations/signals summary.
- Improved the PS history to reduce decoding errors.
- Calls to the webservers API have been strengthened. New calls are attempted every 5 seconds if the first one is unsuccessful.

--- 29/01/2026 ---
- Added bandscan and detailed reports function with TXT and PDF export.

--- 13/01/2026 ---
- The values in the PS/PTY/PTYN history are now separated.
- Added Flag A / Flag B display for the PTYN field as a tooltip.
- Added Ensemble ID and Channel info in the groups monitor when the DAB Cross-Referencing ODA is detected.
- Added new underscores option: "Progressive underscores on RT".

--- 04/01/2026 ---
- Removed RDS/RBDS button. Both PTY versions are now displayed in the field, separated by a vertical line.
- Improved data export to text. Output is now smoother and includes more information.
- Improved the mapped frequencies display in the EON section. 10 frequencies can be displayed now, instead of 4.
- Added a function to show spaces as underscores in the PS history.

--- 03/01/2026 ---
- Changed the BER indicator behavior: It will now appear after 3 seconds to prevent the display of incorrect values, waiting for the RDS websocket to stabilize itself.

--- 31/12/2025 ---
- Added automatic RDS data reset on frequency change.
- Fixed some errors in the characters table.
- Fixed an issue that caused the RT indicator not to be active when RT was being sent, but without text being displayed on screen.

--- 29/12/2025 ---
- The interface has been reviewed to allow usage on smartphones, but exclusively in landscape format.
- Plugin released for the TEF webservers.

--- 20/12/2025 ---
- Improved characters compatibility for the PTYN and Long PS fields, to resolve some decoding errors.
- Added the possibility to connect to another server without clicking "Disconnect", thanks to the Enter key.
- Added the possibility to connect automatically to a server by using the "?url=" parameter.
- More improvements made to the TMC decoder.

--- 14/12/2025 ---
- Added recognition of more than 1500 events messages to the TMC decoder.
- Added "Pause" and "Copy" buttons to the PS/PTY/PTYN and Radiotext History functions.
- Groups descriptions added to the groups monitor as tooltips.

--- 11/12/2025 ---
- Added ECC and LIC recognition as tooltips.

--- 08/12/2025 ---
- Added ODA flag. Details are now visible when the mouse cursor is placed on the flag, thanks to a tooltip.
- Improvements made to the Radiotext+ decoding.
- "Pause" button added to the groups monitor.

--- 07/12/2025 ---
- Improvements made to the group distribution statistics in order to ignore incorrect packets.
- Fixing some errors in the RT+ tags decoding.
- Improving special characters decoding.

--- 06/12/2025 ---
Official beginning of the project.
# RDSExpert Changelog

### --- 25/02/2026 ---
- Added In-House Applications decoding. There is now an "IH" indicator: It lights up when such data is detected. To click on it will allow the user to view the data sent on groups 6A and 6B. An intelligent mechanism verifies whether groups 6A and 6B are actually used for sending In-House data or for an ODA.
- Added TDC (Transparent Data Channel) decoding. There is now a "TDC" indicator: It lights up when such data is detected. To click on it will allow the user to view the data sent on groups 5A and 5B. An intelligent mechanism verifies whether groups 5A and 5B are actually used for sending TDC data or for an ODA.
- Fixed special characters display in the groups monitor (More precisely in the Groups Content viewer). Some letters specific to certain languages were incorrectly displayed.

### --- 22/02/2026 ---
- Added TMC Map feature thanks to the contribution of Sjef Verhoeven (@PE5PVB). A major thanks to him for his work!

### --- 17/02/2026 ---
- Added "EWS ID" into the description of group 1A in the Groups Monitor and the PDF + TXT exports.
- Added identification for factory PI 3180 (PCS Electronics).
- Added new factory PI codes for PCS Electronics: A1B8 and C080.
  
### --- 16/02/2026 ---
- Added EWS (Emergency Warning System) indicator. The new box lights up if the station sends an EWS indication on group 1A, and the 2-character ID appears. Alerts details are not supported and displayed, the official documentation on the subject is, unfortunately, relatively low.
- Added factory PI codes detection and identification. When a factory code is detected, the "PI" field becomes red. Details about who uses this code are visible as a tooltip when the user puts the mouse cursor on the PI field. The values in database are based on RDS encoders manuals, personal knowledge and kind contributions from people who are into radio engineering.
- Added frequencies counter for AF Method A.
- Added PI to Callsign converter (for USA) as a tooltip. It appears when the user puts the mouse cursor on a PI value, if valid for such conversion.
- PS underscores reduced for stations using 2B group for the Radiotext, since 2B only allows 32 characters text. When underscores are enabled on RT, they will stop at the 32nd character. The underscores rule remains the same for stations using 2A for RT.
- Underscores are now removed on Long PS and RT once a <0D> code is detected. They are still visible on the "Progressive underscores on RT" mode.
- Underscores are now removed on Long PS when the decoded RDS doesn't include this function (via group 15A).

### --- 15/02/2026 ---
- TMC decoder: Fixed a bug in the Provider Name display.

### --- 14/02/2026 ---
- Added a tooltip to each RT line to indicate the maximum number of characters that can be sent depending on the group used, 2A or 2B ("32 char." / "64 char.")
- Added an "information" icon. Clicking it will redirect the user to the decoder's documentation on GitHub (Wiki) via a new tab.
- Added EID and Channel info in the ODA's section of the PDF/TXT exports when the DAB Cross-Referencing ODA is detected.
- Added Radiotext technical codes (e.g. <0D>) to the Radiotext history on the interface and in the TXT export.
- Added user's preferences storage in the web browser (using localStorage). For example, if the user enables underscores on PS/RT, they will appear at the next session.
- Bandscan export: Added a delay of 2 seconds before an RDS is considered as "storable" to prevent RDS data from being logged for a previous frequency.
- Detailed data/Bandscan export: Added empty Radiotext recognition. If a station doesn't send text but a technical code such as <0D>, the RT will be displayed as is.
- Empty PS messages are now detected and stored in the PS history.
- Fixed missing ECC recognition for Finland (6xxx > E1).
- TMC decoder: Added provider name, decoded from Group 8A.

### --- 11/02/2026 ---
- Added TP, TA and PTY values to the PDF's EON section, in addition to the AF and Mapped Frequencies that were already included.
- Added an error message if the webserver API cannot be contacted when starting a bandscan.
- Radiotext codes (e.g. <0D>) are now displayed in the PDF exports.

### --- 01/02/2026 ---
- Bandscan/Detailed data export: Added dBf to dBuV conversion in the export-preview modal.
- Bandscan/Detailed data export: Added dynamic PS messages display in the main PS field, limited to 14 messages.
- Bandscan/Detailed data export: Added purple color to the PS field for stations using a dynamic PS in the stations/signals summary.
- Calls to the webservers API have been strengthened. New calls are attempted every 5 seconds if the first one is unsuccessful.
- Improved the PS history to reduce decoding errors.

### --- 29/01/2026 ---
- Added bandscan and detailed reports function with TXT and PDF export.

### --- 13/01/2026 ---
- Added Ensemble ID and Channel info in the groups monitor when the DAB Cross-Referencing ODA is detected.
- Added Flag A / Flag B display for the PTYN field as a tooltip.
- Added new underscores option: "Progressive underscores on RT".
- The values in the PS/PTY/PTYN history are now separated.

### --- 04/01/2026 ---
- Added a function to show spaces as underscores in the PS history.
- Improved data export to text. Output is now smoother and includes more information.
- Improved the mapped frequencies display in the EON section. 10 frequencies can be displayed now, instead of 4.
- Removed RDS/RBDS button. Both PTY versions are now displayed in the field, separated by a vertical line.

### --- 03/01/2026 ---
- Changed the BER indicator behavior: It will now appear after 3 seconds to prevent the display of incorrect values, waiting for the RDS websocket to stabilize itself.

### --- 31/12/2025 ---
- Added automatic RDS data reset on frequency change.
- Fixed an issue that caused the RT indicator not to be active when RT was being sent, but without text being displayed on screen.
- Fixed some errors in the characters table.

### --- 29/12/2025 ---
- Integration plugin released for the TEF webservers (Check the "RDSExpert-Plugin" repository for more details).
- The interface has been reviewed to allow usage on smartphones, but exclusively in landscape format.

### --- 20/12/2025 ---
- Added the possibility to connect to another server without clicking "Disconnect", thanks to the Enter key.
- Added automatic connection to a webserver by using the "?url=" parameter.
- Improved characters compatibility for the PTYN and Long PS fields, to resolve some decoding errors.
- More improvements made to the TMC decoder.

### --- 14/12/2025 ---
- Added "Pause" and "Copy" buttons to the PS/PTY/PTYN and Radiotext History functions.
- Added recognition of more than 1500 events messages to the TMC decoder.
- Groups descriptions added to the groups monitor as tooltips.

### --- 11/12/2025 ---
- Added ECC and LIC recognition as tooltips.

### --- 08/12/2025 ---
- Added ODA flag. Details are now visible when the mouse cursor is placed on the flag, thanks to a tooltip.
- Improvements made to the Radiotext+ decoding.
- "Pause" button added to the groups monitor.

### --- 07/12/2025 ---
- Fixed some errors in the RT+ tags decoding.
- Improved special characters decoding.
- Improvements made to the group distribution statistics in order to ignore incorrect packets.

### --- 06/12/2025 ---
Official beginning of the project.
















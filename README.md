# RDSExpert | Introduction

RDSExpert is an advanced RDS (Radio Data System) decoder for TEF webservers, based on HTML and TypeScript.
<br>
It is also designed for RBDS (RDS variant for North America).
<br>
<br>
-> [You can access the interface by clicking on this link.](https://lucasgallone.github.io/RDSExpert)
<br>
-> Otherwise, you can copy and paste the following URL: `https://lucasgallone.github.io/RDSExpert/`
<br>
-> You can also integrate RDSExpert directly into your webserver as a plugin! Instructions are provided below.
<br>
<br>
This tool will be of particular interest to radio engineers and anyone with an interest in radio engineering. Its purpose is to allow in-depth analysis of the RDS data carried by FM signals, which webservers cannot completely display for obvious usability reasons.
<br>
<br>
Below, you will find a list of the elements that RDSExpert can decode and display, along with technical details.
<br>
<br>
<b>It is important to note that the RDS decoding is less sensitive than that used natively by TEF webservers.</b> Therefore, an "acceptable" signal is necessary for accurate decoding. While it would be technically possible to increase the decoding sensitivity, this would increase the risk of displaying erroneous data, making the tool less reliable. For DX receptions and very weak signals, it is therefore strongly recommended to use the integrated decoder of the TEF webservers.
<br>
<br>
<b>Initially, this tool only works with HTTPS servers due to webservers restrictions.
<br>
Another version hosted by [@Bkram](https://github.com/bkram/) exists, and you will be linked to it if you indicate an HTTP webserver URL on the interface.</b>
<br>
Follow the on-screen instructions after indicating it, and you'll be able to use the tool that way.
<br>
<br>
<b>📱 RDSExpert is also available as a mobile version. However, you must rotate your smartphone to landscape mode to use the interface.</b>
<br>
<br>
Special thanks to [@mrwish7](https://github.com/mrwish7/) for the initial implementation of WebSocket decoding, without which creating this tool would have been much more complicated. Thanks also to everyone who offers suggestions, provides feedback on the decoder's functionality, and so on.

# Integrate RDSExpert into your TEF webserver as a plugin!
If you want to use RDSExpert directly on your TEF webserver, this plugin is made for you!
<br>
<br>
The integrated interface allows you to use the decoder in a compact and direct way thanks to a floating window on the server.
<br>
No need to open a new tab in your web browser and enter your server URL every time. Everything is automated!
<br>
<br>
To download the plugin and install it on your webserver, [follow the instructions by clicking here.](https://github.com/LucasGallone/RDSExpert-Plugin)
<br>
Or copy-paste the following link: `https://github.com/LucasGallone/RDSExpert-Plugin`

# Getting started | Help documentation

To learn how to use RDSExpert and find out more about the various functions offered by the decoder:
<br>
[Go to the Wiki section by clicking here.](https://github.com/LucasGallone/RDSExpert/wiki/Getting-started)

-- SO Workers switch panel (Mac) — no Terminal window.
-- Usage: osascript so-worker-switch-mac.applescript /path/to/so-worker-mac-lib.sh

on run argv
	if (count of argv) < 1 then
		display dialog "ขาด path ของ so-worker-mac-lib.sh" with title "SO Workers" buttons {"ตกลง"} default button 1 with icon stop
		return
	end if
	set lib to item 1 of argv as text
	my panelLoop(lib)
end run

on runLib(lib, args)
	set cmd to "export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH; /bin/bash " & quoted form of lib & " " & args
	return do shell script cmd
end runLib

on parseStatus(txt)
	set scrape to "off"
	set auto to "off"
	set sha to "?"
	set host to "?"
	set AppleScript's text item delimiters to linefeed
	set linesList to text items of txt
	set AppleScript's text item delimiters to ""
	repeat with L in linesList
		set lineText to L as text
		if lineText starts with "scrape=" then set scrape to text 8 thru -1 of lineText
		if lineText starts with "autopost=" then set auto to text 10 thru -1 of lineText
		if lineText starts with "sha=" then set sha to text 5 thru -1 of lineText
		if lineText starts with "host=" then set host to text 6 thru -1 of lineText
	end repeat
	return {scrape, auto, sha, host}
end parseStatus

on labelFor(stateName)
	if stateName is "on" then return "เปิดอยู่"
	return "ปิดอยู่"
end labelFor

on btnFor(stateName, kind)
	if stateName is "on" then return "ปิด " & kind
	return "เปิด " & kind
end btnFor

on panelLoop(lib)
	repeat
		try
			set st to my parseStatus(my runLib(lib, "status"))
			set scrape to item 1 of st
			set auto to item 2 of st
			set sha to item 3 of st
			set host to item 4 of st
		on error errMsg
			display dialog "อ่านสถานะไม่สำเร็จ:" & return & errMsg with title "SO Workers" buttons {"ปิดแผง"} default button 1 with icon stop
			return
		end try

		set scrapeMark to "○"
		set autoMark to "○"
		if scrape is "on" then set scrapeMark to "●"
		if auto is "on" then set autoMark to "●"

		set promptText to "Scrap      " & scrapeMark & "  " & my labelFor(scrape) & return & "Autopost  " & autoMark & "  " & my labelFor(auto) & return & return & "โค้ด: " & sha & return & "เครื่อง: " & host & return & return & "กดปุ่มเพื่อสลับ — ไม่มีหน้าต่าง Terminal"

		set bScrap to my btnFor(scrape, "Scrap")
		set bAuto to my btnFor(auto, "Autopost")
		try
			set choice to button returned of (display dialog promptText with title "SO Workers" buttons {bScrap, bAuto, "อื่นๆ…"} default button 1)
		on error number -128
			return
		end try

		if choice is bScrap then
			try
				my runLib(lib, "toggle-scrape")
			on error errMsg
				display dialog errMsg with title "Scrap" buttons {"ตกลง"} default button 1 with icon stop
			end try
		else if choice is bAuto then
			try
				my runLib(lib, "toggle-autopost")
			on error errMsg
				display dialog errMsg with title "Autopost" buttons {"ตกลง"} default button 1 with icon stop
			end try
		else
			try
				set more to button returned of (display dialog "คำสั่งเพิ่ม" with title "SO Workers" buttons {"อัปเดตโค้ด", "เปิดโฟลเดอร์ log", "ปิดแผง"} default button 1)
			on error number -128
				set more to "ปิดแผง"
			end try
			if more is "อัปเดตโค้ด" then
				try
					set out to my runLib(lib, "update")
					display dialog out with title "อัปเดตโค้ด" buttons {"ตกลง"} default button 1 with icon note
				on error errMsg
					display dialog errMsg with title "อัปเดตโค้ดไม่สำเร็จ" buttons {"ตกลง"} default button 1 with icon stop
				end try
			else if more is "เปิดโฟลเดอร์ log" then
				try
					my runLib(lib, "open-logs")
				end try
			else
				return
			end if
		end if
	end repeat
end panelLoop

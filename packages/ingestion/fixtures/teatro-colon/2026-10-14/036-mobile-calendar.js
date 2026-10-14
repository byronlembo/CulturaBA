function updateCalendar(year, month) {
    document.getElementById("calendar-table").classList.add("loading");
    const xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200) {
            //console.log(this);
            const response = JSON.parse(this.responseText);
            if (response.calendar) {
                // Actualizar el contenido de la tabla del calendario
                document.querySelector(".mobile-calendar table").innerHTML = response.calendar;

                // Actualiza el botón de navegación hacia atrás (mes anterior)
                const currentMonth = new Date().getMonth() + 1;
                const currentYear = new Date().getFullYear();
                const prevButton = document.querySelector(".calendar-prev");
                if (currentMonth === month && currentYear === year) {
                    prevButton.disabled = true; // Deshabilita el botón
                } else {
                    prevButton.disabled = false; // Habilita el botón
                }
                document.getElementById("calendar-table").classList.remove("loading");
            } else {
                console.error("Error al cargar el calendario.");
                document.getElementById("calendar-table").classList.remove("loading");
            }
        }
    };

    xmlhttp.open("GET", ajax_var.url + '?action=' + ajax_var.action + '&nonce=' + ajax_var.nonce + '&year=' + year + '&month=' + month, true);
    xmlhttp.send();
}

function previousMonth() {
    // Obtener el mes y el año actual
    let currentMonth = parseInt(document.getElementById("monthYear").getAttribute("data-month"));
    let currentYear = parseInt(document.getElementById("monthYear").getAttribute("data-year"));

    // Calcular el mes y el año anterior
    if (currentMonth === 1) {
        currentMonth = 12;
        currentYear--;
    } else {
        currentMonth--;
    }

    // Actualizar el encabezado y el calendario
    updateCalendar(currentYear, currentMonth);

    // Actualizar el encabezado con el nuevo mes y año
    document.getElementById("monthYear").textContent = getMonthName(currentMonth) + " " + currentYear;
    document.getElementById("monthYear").setAttribute("data-month", currentMonth);
    document.getElementById("monthYear").setAttribute("data-year", currentYear);
}

function nextMonth() {
    // Obtener el mes y el año actual
    let currentMonth = parseInt(document.getElementById("monthYear").getAttribute("data-month"));
    let currentYear = parseInt(document.getElementById("monthYear").getAttribute("data-year"));

    // Calcular el mes y el año siguiente
    if (currentMonth === 12) {
        currentMonth = 1;
        currentYear++;
    } else {
        currentMonth++;
    }

    // Actualizar el encabezado y el calendario
    updateCalendar(currentYear, currentMonth);

    // Actualizar el encabezado con el nuevo mes y año
    document.getElementById("monthYear").textContent = getMonthName(currentMonth) + " " + currentYear;
    document.getElementById("monthYear").setAttribute("data-month", currentMonth);
    document.getElementById("monthYear").setAttribute("data-year", currentYear);
}

function getMonthName(month) {
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    return monthNames[month - 1];
}

// Inicializar el calendario con el mes y el año actuales
let calendarMobile = document.getElementById("calendar-table");
if ( calendarMobile ) {
    let currentMonth = calendarMobile.getAttribute("data-currentmonth");
    let currentYear = calendarMobile.getAttribute("data-currentyear");
    updateCalendar(currentYear, currentMonth);
    document.getElementById("monthYear").textContent = getMonthName(currentMonth) + " " + currentYear;
    document.getElementById("monthYear").setAttribute("data-month", currentMonth);
    document.getElementById("monthYear").setAttribute("data-year", currentYear);
}